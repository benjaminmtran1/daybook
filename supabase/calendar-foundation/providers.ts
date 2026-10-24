import {assertICloudUrl} from './security.ts';
import {validateCalendarDraft,type CalendarDraft} from '../../web/calendar-connections.ts';
type Fetch = typeof fetch;
export class ProviderError extends Error {status:number;constructor(status:number){super(status===401?'Reconnect this calendar account.':status===412?'This event already exists or changed.':status===429?'Calendar rate limit reached. Please retry later.':'Calendar provider request failed.');this.status=status;}}
export const GOOGLE_READ_SCOPES=['https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly'];
export const GOOGLE_CREATE_SCOPE='https://www.googleapis.com/auth/calendar.events.owned';
export function googleAuthorizationUrl(config:{clientId:string;redirectUri:string;state:string;challenge:string;create:boolean}){
 const callback=new URL(config.redirectUri);if(callback.protocol!=='https:')throw Error('An HTTPS callback is required.');
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:callback.href,response_type:'code',prompt:'consent select_account',access_type:'offline',include_granted_scopes:'true',state:config.state,code_challenge:config.challenge,code_challenge_method:'S256',scope:[...GOOGLE_READ_SCOPES,...(config.create?[GOOGLE_CREATE_SCOPE]:[])].join(' ')}).toString();return url.href;
}
/** token supplied only by authenticated gateway after per-user selection checks. */
export function googleCalendar(token:string,send:Fetch=fetch){
 async function request(path:string,init:RequestInit={}){const response=await send('https://www.googleapis.com/calendar/v3/'+path,{...init,redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...init.headers}});if(!response.ok)throw new ProviderError(response.status);return response.json();}
 return {
  listCalendars:(pageToken='')=>request('users/me/calendarList?'+new URLSearchParams({maxResults:'250',...(pageToken?{pageToken}:{})})),
  listEvents:(calendarId:string,start:string,end:string,pageToken='')=>{if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>93*86400000)throw Error('Choose an event window up to 93 days.');return request('calendars/'+encodeURIComponent(calendarId)+'/events?'+new URLSearchParams({timeMin:start,timeMax:end,singleEvents:'true',orderBy:'startTime',maxResults:'250',...(pageToken?{pageToken}:{})}));},
  createEvent:(calendarId:string,id:string,draft:CalendarDraft)=>{const event=validateCalendarDraft(draft);if(!/^[0-9a-f]{64}$/.test(id))throw Error('Invalid idempotency key.');return request('calendars/'+encodeURIComponent(calendarId)+'/events?sendUpdates=none',{method:'POST',body:JSON.stringify({id,summary:event.title,start:{dateTime:event.start,timeZone:event.timeZone},end:{dateTime:event.end,timeZone:event.timeZone}})});},
  getEvent:(calendarId:string,id:string)=>request('calendars/'+encodeURIComponent(calendarId)+'/events/'+encodeURIComponent(id)),
 };
}
function icalText(s:string){return s.replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');}
function utcStamp(s:string){return new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function fold(line:string){let result='',count=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(count+n>75){result+='\r\n ';count=1;}result+=c;count+=n;}return result;}
export function calendarDocument(id:string,draft:CalendarDraft,now=new Date().toISOString()){
 const e=validateCalendarDraft(draft);if(!/^[0-9a-f]{64}$/.test(id))throw Error('Invalid idempotency key.');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Daybook//Calendar//EN','BEGIN:VEVENT','UID:'+id+'@daybook','DTSTAMP:'+utcStamp(now),'DTSTART:'+utcStamp(e.start),'DTEND:'+utcStamp(e.end),'SUMMARY:'+icalText(e.title),'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
/** CalDAV transport foundation. Discovery/REPORT XML decoding and recurrence expansion
 * must be supplied and integration-tested before enabling a live endpoint. */
export function iCloudCalendar(username:string,appPassword:string,send:Fetch=fetch){
 const auth='Basic '+btoa(unescape(encodeURIComponent(username+':'+appPassword)));
 async function request(url:string,init:RequestInit){const endpoint=assertICloudUrl(url);const response=await send(endpoint.href,{...init,redirect:'error',headers:{Authorization:auth,...init.headers}});if(!response.ok)throw new ProviderError(response.status);return response;}
 return {
  discover:()=>request('https://caldav.icloud.com/',{method:'PROPFIND',headers:{Depth:'0','Content-Type':'application/xml; charset=utf-8'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'}),
  properties:(url:string)=>request(url,{method:'PROPFIND',headers:{Depth:'1','Content-Type':'application/xml; charset=utf-8'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><d:current-user-privilege-set/><c:calendar-home-set/><c:supported-calendar-component-set/></d:prop></d:propfind>'}),
  createEvent:(calendarUrl:string,id:string,draft:CalendarDraft)=>{const base=assertICloudUrl(calendarUrl);if(!base.pathname.endsWith('/'))throw Error('Invalid calendar collection.');const document=calendarDocument(id,draft);return request(new URL(id+'.ics',base).href,{method:'PUT',headers:{'Content-Type':'text/calendar; charset=utf-8','If-None-Match':'*'},body:document});},
  // There is deliberately no PUT-existing, PATCH, MOVE or DELETE operation.
 };
}
