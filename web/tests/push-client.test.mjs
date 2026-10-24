import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const original=Object.fromEntries(['window','navigator','Notification','localStorage','location'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
after(()=>{for(const [name,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}delete globalThis.__pushHarness;});
const source=await readFile(new URL('../push-client.ts',import.meta.url),'utf8');
let moduleId=0;
async function harness({configured=true,existing=false,invokeError=false,previousOwner=null,switched=false}={}) {
 const calls=[],storage=new Map(previousOwner?[['daybook-push-owner-v1',previousOwner]]:[]);
 const subscription={endpoint:'https://web.push.apple.com/token',toJSON:()=>({endpoint:'https://web.push.apple.com/token',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}}),unsubscribe:async()=>{calls.push('unsubscribe');return true;}};
 const registration={active:true,pushManager:{getSubscription:async()=>existing?subscription:null,subscribe:async()=>{calls.push('subscribe');existing=true;return subscription;}}};
 let gets=0;
 const supabase={auth:{getSession:async()=>({data:{session:{user:{id:switched&&++gets>1?'other':'owner'},access_token:'token'}}}),getUser:async(token)=>{calls.push(['verify',token]);return {data:{user:{id:'owner'}}};}},functions:{invoke:async(name,args)=>{calls.push(['invoke',name,args]);return invokeError?{error:new Error('offline')}:{data:{enabled:true}};}}};
 globalThis.__pushHarness={supabase,register:async()=>registration};
 for(const [name,value] of Object.entries({window:{isSecureContext:true,Notification:true,PushManager:true},navigator:{serviceWorker:{getRegistration:async()=>registration,ready:Promise.resolve(registration)}},Notification:{permission:'default',requestPermission:async()=>{calls.push('permission');return 'granted';}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{href:'https://example.com/daybook/'}}))Object.defineProperty(globalThis,name,{value,configurable:true});
 const stub='data:text/javascript,'+encodeURIComponent('export const supabase=globalThis.__pushHarness.supabase;export const registerDaybookWorker=globalThis.__pushHarness.register; // '+(++moduleId));
 let compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 .replace("from './backend'",`from '${stub}'`).replace("from './pwa'",`from '${stub}'`)
 .replace("from '../supabase/push-foundation/core'",`from '${new URL('../../supabase/push-foundation/core.ts',import.meta.url).href}'`)
 .replaceAll('import.meta.env.VITE_DAYBOOK_VAPID_PUBLIC_KEY',JSON.stringify('B'.repeat(87)))
 .replaceAll('import.meta.env.VITE_DAYBOOK_PUSH_ENABLED',JSON.stringify(configured?'true':'false'))
 .replaceAll('import.meta.env.BASE_URL',JSON.stringify('/daybook/'));
 const module=await import('data:text/javascript;base64,'+Buffer.from(compiled+`\n// ${++moduleId}`).toString('base64'));
 return {module,calls,storage};
}
const preferences={enabled:true,timeZone:'America/Toronto',morning:'08:00',evening:'18:00',due:'09:00',quietStart:'22:00',quietEnd:'07:00',taskAlerts:[]};
test('disabled configuration never invokes permission or subscription',async()=>{const h=await harness({configured:false});assert.equal(await h.module.pushStatus('owner'),null);await assert.rejects(()=>h.module.enableDevicePush('owner',preferences));assert.deepEqual(h.calls,[]);});
test('explicit enable requests permission then pins verified credential',async()=>{const h=await harness();await h.module.enableDevicePush('owner',preferences);assert.equal(h.calls[0],'permission');const call=h.calls.find(c=>Array.isArray(c)&&c[0]==='invoke');assert.equal(call[1],'daybook-push');assert.equal(call[2].headers.Authorization,'Bearer token');assert.equal(call[2].body.action,'subscribe');assert.equal(h.storage.get('daybook-push-owner-v1'),'owner');});
test('previous account marker blocks enable before a permission prompt',async()=>{const h=await harness({previousOwner:'previous'});await assert.rejects(()=>h.module.enableDevicePush('owner',preferences),/previous/);assert.deepEqual(h.calls,[]);});
test('failed subscribe cleans up a newly created device subscription',async()=>{const h=await harness({invokeError:true});await assert.rejects(()=>h.module.enableDevicePush('owner',preferences));assert.ok(h.calls.includes('unsubscribe'));assert.equal(h.storage.has('daybook-push-owner-v1'),false);});
test('signout disables local subscription even when server unavailable',async()=>{const h=await harness({existing:true,invokeError:true,previousOwner:'owner'});const result=await h.module.disconnectDevicePush('owner');assert.ok(h.calls.includes('unsubscribe'));assert.match(result,/cleanup could not be confirmed/);assert.equal(h.storage.has('daybook-push-owner-v1'),false);});
test('account switch response is rejected and new subscription cleaned up',async()=>{const h=await harness({switched:true});await assert.rejects(()=>h.module.enableDevicePush('owner',preferences),/account changed/);assert.ok(h.calls.includes('unsubscribe'));});
