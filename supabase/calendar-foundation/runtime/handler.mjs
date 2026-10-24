import {createEventKey} from '../security.ts';
import {createSelectedEvent} from '../gateway.ts';
import {googleCalendar,GOOGLE_CREATE_SCOPE} from '../providers.ts';
import {caldavClient,calendarWindow,normalizeIcs} from './caldav.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requiredId(value){if(typeof value!=='string'||!uuid.test(value))throw Error('Invalid connection.');return value;}
function publicGoogleEvent(e){if(e.status==='cancelled')return [];const start=e.start?.dateTime||e.start?.date,end=e.end?.dateTime||e.end?.date;if(!start||!end)return [];let originalUrl;try{const u=new URL(e.htmlLink);if(u.protocol==='https:'&&(u.hostname==='www.google.com'||u.hostname==='calendar.google.com'))originalUrl=u.href;}catch{}return [{id:e.id,title:e.summary||'Untitled event',start,end,allDay:!!e.start.date,originalUrl}];}
/** Request/Response handler. No listener, deployment, secret creation or public enablement. */
export function createCalendarHandler({config,auth,repository,vault,oauth,send=fetch}){
 const allowedOrigin=new URL(config.appOrigin).origin;
 const returnUrl=new URL(config.appReturnUrl||config.appOrigin);if(returnUrl.origin!==allowedOrigin||returnUrl.username||returnUrl.password||returnUrl.hash)throw Error('Invalid calendar return URL.');
 if(!allowedOrigin.startsWith('https://'))throw Error('Calendar frontend must use HTTPS.');
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':allowedOrigin,'Vary':'Origin','X-Content-Type-Options':'nosniff'}});
 async function owned(owner,id){const row=await repository.connection(owner,requiredId(id));if(!row||row.ownerId!==owner)throw Error('Calendar connection unavailable.');return row;}
 async function adapter(connection){return connection.provider==='google'?googleCalendar(await oauth.access(connection),send):caldavClient(await vault.open(connection.credentials,connection.ownerId,connection.id),send);}
 async function calendars(connection,api){if(connection.provider==='icloud')return api.calendars();const result=[];let page='';for(let n=0;n<20;n++){const response=await api.listCalendars(page);for(const c of response.items||[])result.push({id:c.id,name:c.summary||'Google calendar',writable:c.accessRole==='owner'&&connection.scopes.includes(GOOGLE_CREATE_SCOPE)});page=response.nextPageToken;if(!page)return result;}throw Error('Too many Google calendars.');}
 return async function handle(request){
  if(config.enabled!==true)return json({error:'Calendar connections are not enabled.'},503);
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname.endsWith('/callback')){
   // No token exchange here: completion requires the initiating Daybook owner
   // and its browser-only transaction nonce, neither of which is in this URL.
   const target=new URL(returnUrl);const state=url.searchParams.get('state'),code=url.searchParams.get('code'),error=url.searchParams.get('error');
   if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state)||(!error&&(!code||code.length>4096)))return json({error:'Invalid authorization callback.'},400);
   const fragment=new URLSearchParams({calendar_state:state});if(error)fragment.set('calendar_error','access_denied');else fragment.set('calendar_code',code);target.hash=fragment.toString();
   return new Response(null,{status:303,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  if(request.headers.get('Origin')!==allowedOrigin)return json({error:'Calendar request origin is not allowed.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type, apikey','Vary':'Origin'}});
  if(request.method!=='POST'||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use an authenticated JSON request.'},405);
  let owner;
  try{const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)return json({error:'Sign in to manage calendars.'},401);const user=await auth(token);if(!user?.id)return json({error:'Sign in to manage calendars.'},401);owner=user.id;}catch{return json({error:'Sign in to manage calendars.'},401);}
  let action,writeMayHaveStarted=false;
  try{
   // Per-user server rate limiting is required even when callers spoof Origin.
   if(!await repository.rateLimit(owner))return json({error:'Too many calendar requests. Try again shortly.'},429);
   const length=Number(request.headers.get('Content-Length')||0);if(length>32768)return json({error:'Request too large.'},413);
   const reader=request.body?.getReader();let bytes=0,body='';const decoder=new TextDecoder();if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32768){await reader.cancel();return json({error:'Request too large.'},413);}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();const input=JSON.parse(body);action=input.action;
   if(input.action==='status'){const connections=await repository.connections(owner);return json({connections:await Promise.all(connections.map(async c=>({id:c.id,provider:c.provider,state:c.state,calendars:await repository.selections(owner,c.id)})))});}
   if(input.action==='google-complete')return json(await oauth.callback({state:input.state,code:input.code,error:input.error},owner,input.transactionNonce));
   if(input.action==='google-start')return json(await oauth.begin(owner,input.allowCreate===true));
   if(input.action==='icloud-connect'){
    if(config.icloudOnboarding!==true)return json({error:'Secure iCloud onboarding is not enabled.'},503);
    if(typeof input.username!=='string'||input.username.length>254||!input.username.includes('@')||typeof input.appPassword!=='string'||!/^([a-z]{4}-){3}[a-z]{4}$/i.test(input.appPassword))return json({error:'Use an Apple account email and a dedicated app-specific password.'},400);
    const credentials={username:input.username,appPassword:input.appPassword};const available=await caldavClient(credentials,send).calendars();const id=crypto.randomUUID();await repository.saveConnection({id,ownerId:owner,provider:'icloud',scopes:[],credentials:await vault.seal(credentials,owner,id)});return json({id,provider:'icloud',calendars:available});
   }
   const connection=await owned(owner,input.connectionId);
   if(input.action==='disconnect'){if(connection.provider==='google')return json(await oauth.disconnect(connection));await repository.removeConnection(owner,connection.id);return json({disconnected:true,providerRevoked:false,message:'Daybook disconnected. Revoke its app-specific password in your Apple Account to remove provider access.'});}
   if(connection.state!=='connected')throw Error('Reconnect this calendar.');
   const api=await adapter(connection);
   if(input.action==='create-status'){
    const key=await createEventKey(owner,connection.id,input.calendarId,input.requestId);let record=await repository.creation(owner,key);
    if(!record){if(typeof input.payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(input.payloadHash))throw Error('Invalid pending creation fingerprint.');const cancelled=await repository.cancelUnreserved(owner,connection.id,input.calendarId,input.requestId,key,input.payloadHash);if(cancelled)return json({complete:true,cancelled:true,message:'The earlier attempt was safely cancelled before creating an event. You can start a new event.'});record=await repository.creation(owner,key);}
    if(record?.state==='cancelled')return json({complete:true,cancelled:true,message:'The earlier attempt was safely cancelled before creating an event.'});
    if(!record)throw Error('Creation status unavailable.');
    if(record.state==='complete')return json({complete:true,message:'The earlier event was created. Open its original calendar to review it.'});
    try{if(connection.provider==='google')await api.getEvent(input.calendarId,key);else await api.getCreated(input.calendarId,key);await repository.finish(owner,key);return json({complete:true,message:'The earlier event exists in its original calendar. No duplicate was created.'});}catch{return json({complete:false,message:'The earlier creation is still uncertain. Retry the unchanged event or review its original calendar; do not create another copy.'});}
   }
   if(input.action==='calendars')return json({calendars:await calendars(connection,api)});
   if(input.action==='select'){
    if(!Array.isArray(input.calendarIds)||input.calendarIds.length>100||input.calendarIds.some(id=>typeof id!=='string'))throw Error('Invalid selection.');const available=await calendars(connection,api);const wanted=[...new Set(input.calendarIds)];const selected=wanted.map(id=>available.find(c=>c.id===id));if(selected.some(c=>!c))throw Error('Select only calendars from this account.');await repository.select(owner,connection.id,selected);return json({selected:wanted.length});
   }
   const selected=await repository.selections(owner,connection.id);const calendar=selected.find(c=>c.calendarId===input.calendarId);if(!calendar)throw Error('Select this calendar first.');
   if(input.action==='events'){
    calendarWindow(input.start,input.end);let events=[];
    if(connection.provider==='icloud')events=await api.events(calendar.calendarId,input.start,input.end);
    else {let page='';for(let n=0;n<20;n++){const response=await api.listEvents(calendar.calendarId,input.start,input.end,page);events.push(...(response.items||[]).flatMap(publicGoogleEvent));page=response.nextPageToken;if(!page)break;if(n===19)throw Error('Too many events in this window.');}}
    return json({events:events.map(e=>({...e,connectionId:connection.id,calendarId:calendar.calendarId,provider:connection.provider}))});
   }
   if(input.action==='create'){
    const current=(await calendars(connection,api)).find(c=>c.id===calendar.calendarId);if(!current?.writable||!calendar.writable)throw Error('This calendar is read-only.');
    const result=await createSelectedEvent({authenticate:async()=>({id:owner}),selectedCalendar:async()=>({...calendar,connectionId:connection.id,provider:connection.provider,selected:true}),reserve:async(key,hash)=>{
     const state=await repository.reserve(owner,connection.id,calendar.calendarId,input.requestId,key,hash);
     if(state==='pending'||state==='mismatch'||state==='complete')writeMayHaveStarted=true;
     if(state!=='pending')return state;
     // A repeated click may reconcile a lost response, but never writes again blindly.
     try{let original;if(connection.provider==='google'){const e=await api.getEvent(calendar.calendarId,key);original={title:e.summary,start:e.start.dateTime,end:e.end.dateTime};}else {const ics=await api.getCreated(calendar.calendarId,key);original=normalizeIcs(ics,input.draft.start,input.draft.end)[0];}if(original&&original.title===input.draft.title.trim()&&Date.parse(original.start)===Date.parse(input.draft.start)&&Date.parse(original.end)===Date.parse(input.draft.end)){await repository.finish(owner,key);return 'complete';}}catch{/* Keep uncertain outcomes pending without duplicate creation. */}return 'pending';
    },create:async(_,__,id,draft)=>{writeMayHaveStarted=true;return connection.provider==='google'?api.createEvent(calendar.calendarId,id,draft):api.create(calendar.calendarId,id,draft);},finish:key=>repository.finish(owner,key)},'',input);
    return json(result);
   }
   return json({error:'Unsupported calendar operation.'},400);
  }catch{return json({error:'Calendar operation could not be completed. Your existing events were not edited. Check the connection and retry with the same request ID.',...(action==='create'?{writeMayHaveStarted}:{})},400);}
 };
}
