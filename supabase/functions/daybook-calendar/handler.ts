import {fromEnvironment} from '../../calendar-foundation/runtime/index.mjs';
type Environment=Record<string,string|undefined>;
type Factory=(env:Environment)=>(request:Request)=>Promise<Response>;
const names=['CALENDAR_GATEWAY_ENABLED','CALENDAR_ICLOUD_ONBOARDING','CALENDAR_APP_ORIGIN','CALENDAR_APP_RETURN_URL','GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_REDIRECT_URI','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CALENDAR_ENCRYPTION_KEY_BASE64','CALENDAR_ENCRYPTION_KEY_VERSION'];
export function createEdgeHandler(read:(name:string)=>string|undefined,factory:Factory=fromEnvironment){
 let handler:ReturnType<Factory>|undefined;
 const unavailable=()=>new Response(JSON.stringify({error:'Calendar connections are not enabled or configured.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 return async(request:Request):Promise<Response>=>{
  if(read('CALENDAR_GATEWAY_ENABLED')!=='true')return unavailable();
  if(!handler){try{handler=factory(Object.fromEntries(names.map(name=>[name,read(name)])));}catch{return unavailable();}}
  try{return await handler(request);}catch{return unavailable();}
 };
}
