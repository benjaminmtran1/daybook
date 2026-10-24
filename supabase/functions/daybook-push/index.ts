// DRAFT EDGE ADAPTER: not deployed, live-provider/Deno/Postgres verification still required.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
import { dispatchSubscription, type PushRow, type DispatcherAdapter } from '../../push-foundation/core.ts';
import { handlePushAction, readPushBody, type PushApiStore } from '../../push-foundation/api.ts';
const env = (key: string) => Deno.env.get(key) || '';
const origins = env('DAYBOOK_PUSH_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
const enabled = () => env('DAYBOOK_PUSH_ENABLED') === 'true' && !!env('DAYBOOK_VAPID_PUBLIC_KEY') && !!env('DAYBOOK_VAPID_PRIVATE_KEY') && !!env('DAYBOOK_VAPID_SUBJECT') && !!env('DAYBOOK_PUSH_DISPATCH_SECRET') && origins.length > 0;
const admin = () => createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'), { auth:{ persistSession:false,autoRefreshToken:false }, global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)})} });
async function equalSecret(a: string,b: string) {
  if (!a || !b) return false;
  const hash = async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [x,y] = await Promise.all([hash(a),hash(b)]); let difference=0;
  for(let i=0;i<x.length;i++)difference|=x[i]^y[i]; return difference===0;
}
Deno.serve(async request => {
  const origin=request.headers.get('origin');
  const cors:Record<string,string> = origin && origins.includes(origin) ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS'} : {};
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(origin&&!origins.includes(origin))return reply({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(!enabled())return reply({error:'Background reminders are not activated'},503);
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  const db=admin();
  const must=(result:{error:unknown})=>{if(result.error)throw Error('Push storage unavailable');};
  const tasks=async(owner:string)=>{const result=await db.from('daybook_workspaces').select('payload').eq('owner_id',owner).maybeSingle();must(result);return result.data?.payload?.tasks||[];};
  try {
    if(new URL(request.url).pathname.endsWith('/dispatch')) {
      if(!await equalSecret(request.headers.get('x-daybook-dispatch-secret')||'',env('DAYBOOK_PUSH_DISPATCH_SECRET')))return reply({error:'Unauthorized'},401);
      // The scheduler must never be callable through an authenticated browser session.
      if(origin)return reply({error:'Server-only operation'},403);
      const list=await db.from('daybook_push_subscriptions').select('*').order('checked_at').order('id').limit(101);must(list);
      const backlog=(list.data||[]).length>100;
      const started=Date.now();
      const adapter:DispatcherAdapter={tasks,canSend:()=>Date.now()-started<35000,
        active:async(id,owner)=>{const r=await db.from('daybook_push_subscriptions').select('*').eq('id',id).eq('owner_id',owner).maybeSingle();must(r);return r.data;},
        claim:async(id,key)=>{const r=await db.from('daybook_push_attempts').insert({subscription_id:id,event_key:key});if(r.error?.code==='23505')return false;must(r);return true;},
        finish:async(id,key,state)=>{must(await db.from('daybook_push_attempts').update({state}).eq('subscription_id',id).eq('event_key',key));},
        remove:async(id)=>{must(await db.from('daybook_push_subscriptions').delete().eq('id',id));},
        send:async(subscription,payload)=>{await webpush.sendNotification(subscription,JSON.stringify(payload),{vapidDetails:{subject:env('DAYBOOK_VAPID_SUBJECT'),publicKey:env('DAYBOOK_VAPID_PUBLIC_KEY'),privateKey:env('DAYBOOK_VAPID_PRIVATE_KEY')},TTL:900,urgency:'normal',timeout:10000});}
      };
      let attempted=0,failed=0;
      const now=new Date();
      let processed=0;
      for(const row of (list.data||[]).slice(0,100) as PushRow[]) {
        if(Date.now()-started>35000)break;
        try {
          must(await db.from('daybook_push_subscriptions').update({checked_at:now.toISOString()}).eq('id',row.id));
          attempted+=(await dispatchSubscription(row,now,adapter)).attempted;processed++;
        }catch{failed++;}
      }
      return reply({attempted,failed,processed,backlog:backlog||processed<(list.data||[]).length},failed?503:200);
    }
    const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
    if(!token)return reply({error:'Sign in required'},401);
    const verified=await db.auth.getUser(token);
    if(verified.error||!verified.data.user)return reply({error:'Sign in required'},401);
    const owner=verified.data.user.id;
    let input:unknown;try{input=await readPushBody(request);}catch(error){return reply({error:'Invalid or oversized request'},(error as Error).message==='Request too large'?413:400);}
    const store:PushApiStore={tasks,
      get:async(user,endpoint)=>{const r=await db.from('daybook_push_subscriptions').select('preferences').eq('owner_id',user).eq('endpoint',endpoint).maybeSingle();must(r);return r.data;},
      subscribe:async(user,subscription,preferences)=>{
        // Quota and endpoint ownership are atomic inside this service-role-only transaction.
        must(await db.rpc('daybook_push_subscribe',{p_owner:user,p_subscription:subscription,p_preferences:preferences}));
      },
      update:async(user,endpoint,preferences)=>{must(await db.rpc('daybook_push_limit',{p_owner:user}));const r=await db.from('daybook_push_subscriptions').update({preferences,updated_at:new Date().toISOString()}).eq('owner_id',user).eq('endpoint',endpoint).select('id');must(r);if(!r.data?.length)throw Error('Subscription not found');},
      remove:async(user,endpoint)=>{must(await db.rpc('daybook_push_limit',{p_owner:user}));must(await db.from('daybook_push_subscriptions').delete().eq('owner_id',user).eq('endpoint',endpoint));}
    };
    return reply(await handlePushAction(owner,input,store));
  } catch { return reply({error:'Could not complete reminder request. Check configuration and retry.'},400); }
});
