export function allowedCalendarEndpoint(value:string,appOrigin:string){
 const url=new URL(value,appOrigin);
 const sameOrigin=url.origin===appOrigin&&url.pathname==='/api/calendar';
 const supabase=url.origin==='https://zbuiomquumyebfzdinvv.supabase.co'&&url.pathname==='/functions/v1/daybook-calendar';
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(!sameOrigin&&!supabase))throw Error('Calendar gateway URL is not approved for this application.');
 return url.href;
}
type Auth={session:()=>Promise<{access_token:string;user:{id:string}}|null>;user:(token:string)=>Promise<{id:string}|null>};
export function calendarTransport(ownerId:string,endpoint:string,auth:Auth,send:typeof fetch=fetch){
 let disposed=false,generation=0;const pending=new Set<AbortController>();
 return {
  async invoke(body:Record<string,unknown>){
   if(disposed)throw Error('Calendar view closed.');const epoch=generation;const session=await auth.session();if(!session||session.user.id!==ownerId)throw Error('Your Daybook account changed. Sign in again.');const user=await auth.user(session.access_token);if(disposed||epoch!==generation||user?.id!==ownerId)throw Error('Your Daybook account changed.');
   const controller=new AbortController();pending.add(controller);
   try{const response=await send(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(body),signal:controller.signal,redirect:'error'});const data=await response.json();const current=await auth.session();if(disposed||epoch!==generation||current?.user.id!==ownerId)throw Error('Your Daybook account changed.');if(!response.ok)throw Object.assign(Error(data.error||'Calendar request failed.'),{safeToRetry:data.writeMayHaveStarted===false});return data;}finally{pending.delete(controller);}
  },
  activate(){disposed=false;},
  dispose(){disposed=true;generation++;for(const controller of pending)controller.abort();pending.clear();},
 };
}
/** Return every real instant matching a wall time. Empty = DST gap; two = repeat.
 * No browser-local timezone assumptions or silent DST normalization. */
export function calendarWallTime(value:string,timeZone:string):string[]{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return [];
 const [year,month,day,hour,minute]=value.match(/\d+/g)!.map(Number);const base=Date.UTC(year,month-1,day,hour,minute);
 const format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const matches=[];for(let offset=-14*60;offset<=14*60;offset+=15){const instant=new Date(base+offset*60000);const parts=Object.fromEntries(format.formatToParts(instant).map(p=>[p.type,p.value]));if(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`===value)matches.push(instant.toISOString());}return matches;
}
