import {validateCalendarDraft} from './calendar-connections.ts';
import type {CalendarDraft,CalendarProvider} from './calendar-connections';
export type ConnectedCalendar={calendarId:string;name:string;writable:boolean};
export type CalendarConnection={id:string;provider:CalendarProvider;state:'connected'|'reconnect_required';calendars:ConnectedCalendar[]};
export type GatewayCalendarEvent={id:string;title:string;start:string;end:string;allDay:boolean;originalUrl?:string;connectionId:string;calendarId:string;provider:CalendarProvider};
type Invoke=(body:Record<string,unknown>)=>Promise<any>;
/** The browser stores only a short-lived OAuth transaction nonce, never provider
 * credentials. Inject an authenticated gateway invoker bound to this owner. */
export function createCalendarClient(ownerId:string,invoke:Invoke,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,pendingStorage:Pick<Storage,'getItem'|'setItem'|'removeItem'>=storage){
 const pendingKey='daybook-calendar-pending:'+ownerId;
 const clearPending=(expected:{requestId:string;connectionId:string;calendarId:string})=>{const raw=pendingStorage.getItem(pendingKey);if(!raw)return;try{const current=JSON.parse(raw);if(current.requestId===expected.requestId&&current.connectionId===expected.connectionId&&current.calendarId===expected.calendarId)pendingStorage.removeItem(pendingKey);}catch{/* Do not clear an unknown newer record. */}};
 const key=(state:string)=>'daybook-calendar-transaction:'+state;
 return {
  status:async():Promise<{connections:CalendarConnection[]}>=>invoke({action:'status'}),
  async beginGoogle(allowCreate=false){const response=await invoke({action:'google-start',allowCreate});const url=new URL(response.authorizationUrl);if(url.origin!=='https://accounts.google.com')throw Error('Untrusted calendar authorization URL.');const state=url.searchParams.get('state');if(!state||typeof response.transactionNonce!=='string')throw Error('Calendar authorization could not start.');storage.setItem(key(state),JSON.stringify({ownerId,nonce:response.transactionNonce,expiresAt:Date.now()+10*60*1000}));return url.href;},
  async completeGoogle(url:URL,clearFragment:()=>void){const fragment=new URLSearchParams(url.hash.slice(1));const state=fragment.get('calendar_state');if(!state)return false;const code=fragment.get('calendar_code'),error=fragment.get('calendar_error');clearFragment();const saved=storage.getItem(key(state));if(!saved)throw Error('Finish this connection in the browser where you started it.');let transaction;try{transaction=JSON.parse(saved);}catch{throw Error('Calendar authorization is invalid.');}if(transaction.ownerId!==ownerId||transaction.expiresAt<Date.now())throw Error('Sign in to the original Daybook account and reconnect this calendar.');await invoke({action:'google-complete',state,code,error,transactionNonce:transaction.nonce});storage.removeItem(key(state));return true;},
  calendars:(connectionId:string)=>invoke({action:'calendars',connectionId}),
  select:(connectionId:string,calendarIds:string[])=>invoke({action:'select',connectionId,calendarIds}),
  events:(connectionId:string,calendarId:string,start:string,end:string):Promise<{events:GatewayCalendarEvent[]}>=>invoke({action:'events',connectionId,calendarId,start,end}),
  async create(connectionId:string,calendarId:string,requestId:string,draft:CalendarDraft){
   try{draft=validateCalendarDraft(draft);}catch(error){throw Object.assign(error as Error,{safeToRetry:true});}
   const perform=async()=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({connectionId,calendarId,draft:{...draft,title:draft.title.trim()}})));const hash=Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('');const saved=pendingStorage.getItem(pendingKey);let pending=saved?JSON.parse(saved):null;if(pending&&pending.hash!==hash)throw Error('An earlier calendar creation is unresolved. Check its result before creating a different event.');if(!pending){pending={hash,connectionId,calendarId,requestId};pendingStorage.setItem(pendingKey,JSON.stringify(pending));}try{const result=await invoke({action:'create',connectionId,calendarId,requestId:pending.requestId,draft});clearPending(pending);return result;}catch(error){if(!saved&&(error as {safeToRetry?:boolean}).safeToRetry)clearPending(pending);throw error;}};
   return globalThis.navigator?.locks?navigator.locks.request(pendingKey,perform):perform();
  },
  async reconcilePending(){const perform=async()=>{const saved=pendingStorage.getItem(pendingKey);if(!saved)return {complete:true,message:'No unresolved calendar creation.'};const pending=JSON.parse(saved),{connectionId,calendarId,requestId,hash}=pending;const result=await invoke({action:'create-status',connectionId,calendarId,requestId,payloadHash:hash});if(result.complete)clearPending(pending);return result;};return globalThis.navigator?.locks?navigator.locks.request(pendingKey,perform):perform();},
  async disconnect(connectionId:string){const result=await invoke({action:'disconnect',connectionId});const saved=pendingStorage.getItem(pendingKey);if(saved&&JSON.parse(saved).connectionId===connectionId)pendingStorage.removeItem(pendingKey);return result;},
  connectIcloud:(username:string,appPassword:string)=>invoke({action:'icloud-connect',username,appPassword}),
  // Only call from the separately enabled secure onboarding view. Never persist these inputs.
 };
}
