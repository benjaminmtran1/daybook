import {createClient} from '@supabase/supabase-js';
import {dataSchema,emptyData} from './model';
// Public browser key; access is enforced by authenticated database and storage policies.
const url='https://zbuiomquumyebfzdinvv.supabase.co',key='sb_publishable_BPPKoHsXOBk_Ie8JxMNWog_nG9G1kGi';
export const supabase=createClient(url,key);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
export async function daybookFetch(path:string,init:RequestInit|undefined,expectedOwner:string):Promise<Response>{
 try{
  const {data:{session},error:sessionError}=await supabase.auth.getSession();
  if(sessionError||!session||session.user.id!==expectedOwner)return reply({error:'Your account changed or expired. Sign in again before saving.'},401);
  const accessToken=session.access_token;
  const {data:{user},error:authError}=await supabase.auth.getUser(accessToken);
  if(authError||!user||user.id!==expectedOwner)return reply({error:'Your session has expired. Sign in again before saving.'},401);
  // Bind the whole operation to this verified credential. A later account switch
  // must never redirect an old workspace save into the newly signed-in account.
  const requestClient=createClient(url,key,{accessToken:async()=>accessToken,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  if(path==='/api/workspace'&&init?.method==='PUT'){
   const input=JSON.parse(String(init.body));const data=dataSchema.parse(input.data);
   const {data:version,error}=await requestClient.rpc('save_daybook',{document:data,expected_version:input.version});
   if(error)return reply({error:error.code==='40001'?'This workspace changed on another device. Export pending changes or reload.':error.message},error.code==='40001'?409:400);
   return reply({version});
  }
  if(path==='/api/workspace'){
   const {data,error}=await requestClient.from('daybook_workspaces').select('payload,version').eq('owner_id',user.id).maybeSingle();
   if(error)throw error;return reply({data:data?.payload??emptyData(),version:data?.version??0});
  }
  if(path==='/api/files'&&init?.method==='POST'){
   const file=(init.body as FormData).get('file');
   if(!(file instanceof File)||!['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'].includes(file.type)||file.size>10*1024*1024) return reply({error:'Choose a JPEG, PNG, WebP, HEIC image or PDF up to 10 MB.'},400);
   const id=user.id+'/'+crypto.randomUUID();
   const {error}=await requestClient.storage.from('daybook-receipts').upload(id,file,{contentType:file.type,upsert:false});
   if(error)throw error;return reply({id,name:file.name});
  }
  return reply({error:'Unknown operation.'},404);
 }catch(e){return reply({error:e instanceof Error?e.message:(e as {message?:string}).message||'Could not reach your workspace. Please retry.'},400);}
}
export async function receiptUrl(id:string){
 const {data,error}=await supabase.storage.from('daybook-receipts').createSignedUrl(id,60);
 if(error)throw error;return data.signedUrl;
}
