import {Buffer} from 'node:buffer';
import {DOMParser} from '@xmldom/xmldom';
import ICAL from 'ical.js';
import {assertICloudUrl} from '../security.ts';
import {calendarDocument,ProviderError} from '../providers.ts';
const DAV='DAV:',CAL='urn:ietf:params:xml:ns:caldav';
const nodes=(parent,ns,name)=>Array.from(parent.getElementsByTagNameNS(ns,name));
const first=(parent,ns,name)=>nodes(parent,ns,name)[0];
export function parseDav(xml){
 if(new TextEncoder().encode(xml).length>2_000_000||/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml))throw Error('Unsafe or oversized calendar XML.');
 const errors=[];const document=new DOMParser({onError:(level,message)=>errors.push(message)}).parseFromString(xml,'application/xml');
 if(errors.length||document.documentElement.namespaceURI!==DAV||document.documentElement.localName!=='multistatus')throw Error('Invalid calendar XML.');
 return nodes(document,DAV,'response').map(response=>{
  const props=nodes(response,DAV,'propstat').filter(p=>/\s200\s/.test(first(p,DAV,'status')?.textContent||'')).map(p=>first(p,DAV,'prop')).filter(Boolean);
  return {href:first(response,DAV,'href')?.textContent||'',props};
 });
}
export function calendarWindow(start,end){const a=Date.parse(start),b=Date.parse(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>93*86400000)throw Error('Choose an event window up to 93 days.');return {a,b};}
export function normalizeIcs(text,start,end){
 const {a,b}=calendarWindow(start,end);
 if(new TextEncoder().encode(text).length>1_000_000)throw Error('Calendar event is too large.');
 const root=new ICAL.Component(ICAL.parse(text));
 if(root.name!=='vcalendar')throw Error('Invalid calendar event.');
 const components=root.getAllSubcomponents('vevent');if(components.length>2000)throw Error('Calendar contains too many exceptions.');
 const events=components.map(c=>new ICAL.Event(c));const result=new Map();
 function add(item,startDate,endDate,recurrenceId){
  if(item.component.getFirstPropertyValue('status')==='CANCELLED')return;
  if(!startDate||!endDate)throw Error('Calendar event has no dates.');
  for(const d of [startDate,endDate])if(!d.isDate&&(!d.zone||d.zone.tzid==='floating'))throw Error('Calendar uses an unsupported floating or unknown timezone.');
  const s=startDate.toJSDate().getTime(),e=endDate.toJSDate().getTime();
  if(e<=a||s>=b)return;
  if(!Number.isFinite(s)||!Number.isFinite(e)||e<s)throw Error('Invalid calendar event dates.');
  const id=item.uid+'#'+recurrenceId;result.set(id,{id,uid:item.uid,title:item.summary||'Untitled event',start:startDate.isDate?startDate.toString():new Date(s).toISOString(),end:endDate.isDate?endDate.toString():new Date(e).toISOString(),allDay:startDate.isDate,originalUrl:'https://www.icloud.com/calendar/'});
 }
 for(const event of events.filter(e=>!e.isRecurrenceException())){
  for(const exception of events.filter(e=>e.isRecurrenceException()&&e.uid===event.uid))event.relateException(exception);
  if(!event.isRecurring()){add(event,event.startDate,event.endDate,'single');continue;}
  const iterator=event.iterator();let count=0,next;
  while((next=iterator.next())){
   if(++count>10000)throw Error('Calendar recurrence exceeds the safe expansion limit.');
   if(next.toJSDate().getTime()>=b)break;
   const occurrence=event.getOccurrenceDetails(next);add(occurrence.item,occurrence.startDate,occurrence.endDate,next.toString());
  }
 }
 // Include moved exceptions whose original occurrence is outside the window,
 // and server-expanded resources with no recurrence master.
 for(const event of events.filter(e=>e.isRecurrenceException()))add(event,event.startDate,event.endDate,event.recurrenceId.toString());
 return [...result.values()].sort((x,y)=>x.start.localeCompare(y.start));
}
async function boundedText(response){const reader=response.body?.getReader();if(!reader)return '';let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw Error('Calendar response is too large.');}chunks.push(value);}const merged=new Uint8Array(size);let pos=0;for(const chunk of chunks){merged.set(chunk,pos);pos+=chunk.length;}return new TextDecoder().decode(merged);}
const stamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function caldavClient(credentials,send=fetch){
 if(!credentials.username||!credentials.appPassword)throw Error('Reconnect iCloud Calendar.');
 const authorization='Basic '+Buffer.from(credentials.username+':'+credentials.appPassword,'utf8').toString('base64');
 async function request(url,method,body,headers={}){const endpoint=assertICloudUrl(url);const response=await send(endpoint.href,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:authorization,'Content-Type':'application/xml; charset=utf-8',...headers},body});if(!response.ok)throw new ProviderError(response.status);return response;}
 async function prop(url,depth,fields){return parseDav(await boundedText(await request(url,'PROPFIND',`<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="${CAL}"><d:prop>${fields}</d:prop></d:propfind>`,{Depth:depth})));}
 const href=(base,value)=>assertICloudUrl(new URL(value,base).href).href;
 return {
  async calendars(){
   const root='https://caldav.icloud.com/';const initial=await prop(root,'0','<d:current-user-principal/>');const principalValue=initial.flatMap(r=>r.props).map(p=>(first(p,DAV,'current-user-principal')?first(first(p,DAV,'current-user-principal'),DAV,'href')?.textContent:undefined)).find(Boolean);if(!principalValue)throw Error('iCloud principal discovery failed.');
   const principal=href(root,principalValue);const homeProps=await prop(principal,'0','<c:calendar-home-set/>');const homeValue=homeProps.flatMap(r=>r.props).map(p=>(first(p,CAL,'calendar-home-set')?first(first(p,CAL,'calendar-home-set'),DAV,'href')?.textContent:undefined)).find(Boolean);if(!homeValue)throw Error('iCloud calendar discovery failed.');
   const home=href(principal,homeValue);const collections=await prop(home,'1','<d:displayname/><d:resourcetype/><d:current-user-privilege-set/><c:supported-calendar-component-set/>');
   return collections.flatMap(r=>{const p=r.props.find(p=>first(p,CAL,'calendar'));if(!p)return [];const id=href(home,r.href);const components=nodes(p,CAL,'comp');if(components.length&&!components.some(c=>c.getAttribute('name')==='VEVENT'))return [];return [{id,name:first(p,DAV,'displayname')?.textContent||'iCloud calendar',writable:!!first(p,DAV,'write')||!!first(p,DAV,'bind')}];});
  },
  async events(calendarId,start,end){calendarWindow(start,end);const collection=assertICloudUrl(calendarId);if(!collection.pathname.endsWith('/'))throw Error('Invalid calendar collection.');const body=`<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="${CAL}"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(start)}" end="${stamp(end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
   const rows=parseDav(await boundedText(await request(collection.href,'REPORT',body,{Depth:'1'})));if(rows.length>2000)throw Error('Too many calendar events in this window.');
   return rows.flatMap(row=>{const resource=assertICloudUrl(new URL(row.href,collection).href);if(resource.origin!==collection.origin||!resource.pathname.startsWith(collection.pathname))throw Error('Calendar resource is outside its collection.');const data=row.props.map(p=>first(p,CAL,'calendar-data')?.textContent).find(Boolean);return data?normalizeIcs(data,start,end).map(e=>({...e,resourceId:resource.href})):[];});
  },
  async create(calendarId,eventId,draft){const base=assertICloudUrl(calendarId);if(!base.pathname.endsWith('/'))throw Error('Invalid calendar collection.');await request(new URL(eventId+'.ics',base).href,'PUT',calendarDocument(eventId,draft),{'Content-Type':'text/calendar; charset=utf-8','If-None-Match':'*'});},
  async getCreated(calendarId,eventId){if(!/^[a-f0-9]{64}$/.test(eventId))throw Error('Invalid event ID.');const base=assertICloudUrl(calendarId);if(!base.pathname.endsWith('/'))throw Error('Invalid calendar collection.');return boundedText(await request(new URL(eventId+'.ics',base).href,'GET'));},
 };
}
