import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as React from 'react';
const source=await readFile(new URL('../main.tsx',import.meta.url),'utf8');
const names=['location','document','confirm','alert','FormData','__authUi'];
const original=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
after(()=>{for(const [name,d]of Object.entries(original)){if(d)Object.defineProperty(globalThis,name,d);else delete globalThis[name];}});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
let version=0;
async function mount(initialOwner=null){
 const states=[],refs=[],effects=[],calls=[];let s=0,r=0,owner=initialOwner;const signup=deferred(),cleanup=deferred();
 const session=()=>owner?{user:{id:owner},access_token:'token'}:null;
 const auth={getSession:async()=>({data:{session:session()}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signUp:async()=>{calls.push('signup');return signup.promise;},signOut:async()=>{calls.push('signout');return {};}};
 globalThis.__authUi={useState(initial){const i=s++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(value){return refs[r++]||(refs[r-1]={current:value});},useEffect(fn){effects.push(fn);},supabase:{auth},disconnectDevicePush:async(id)=>{calls.push(['disconnect',id]);return cleanup.promise;}};
 for(const [name,value]of Object.entries({location:{hash:'',search:'',origin:'https://example.com',href:'https://example.com/daybook/',pathname:'/daybook/'},document:{getElementById:()=>({})},confirm:()=>true,alert:message=>calls.push(['alert',message]),FormData:class{get(){return 'not-a-real-password';}}}))Object.defineProperty(globalThis,name,{value,configurable:true});
 const stub='data:text/javascript,'+encodeURIComponent('export const {useState,useRef,useEffect,supabase,disconnectDevicePush}=globalThis.__authUi;export default {};export const registerDaybookWorker=async()=>{};export const createRoot=()=>({render(){}});export const authRedirect=()=>"https://example.com/daybook/"; // '+(++version));
 let code=ts.transpileModule(source.replace('function App(){','export function App(){'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
 .replace(/import ['"]\.\/[^'"]+\.css['"];?/g,'')
 .replace(/from ['"](?:react|react-dom\/client|\.\/push-client|\.\/pwa|\.\/auth-redirect|\.\/backend|\.\/Daybook)['"]/g,`from '${stub}'`)
 .replace('from "react/jsx-runtime"',`from '${import.meta.resolve('react/jsx-runtime')}'`)
 .replaceAll('import.meta.env.BASE_URL',JSON.stringify('/daybook/'));
 const {App}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 return {render(){s=0;r=0;return App();},effects,calls,signup,cleanup,switchOwner(next){owner=next;}};
}
function all(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(all)];}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('same-tick duplicate signup submission sends exactly one request',async()=>{const h=await mount();h.render();h.effects[1]();await flush();let tree=h.render();all(tree).find(n=>n.type==='button'&&n.props.children==='Create an account').props.onClick();tree=h.render();const form=all(tree).find(n=>n.type==='form');const event={preventDefault(){},currentTarget:{}};const a=form.props.onSubmit(event),b=form.props.onSubmit(event);assert.deepEqual(h.calls,['signup']);h.signup.resolve({});await Promise.all([a,b]);});
test('double signout click only cleans up once and never signs out switched account',async()=>{const h=await mount('owner');h.render();h.effects[1]();await flush();const tree=h.render();const button=all(tree).find(n=>n.type==='button'&&n.props.children==='Sign out');const a=button.props.onClick(),b=button.props.onClick();assert.deepEqual(h.calls,[['disconnect','owner']]);h.switchOwner('new-owner');h.cleanup.resolve();await Promise.all([a,b]);assert.equal(h.calls.includes('signout'),false);assert.ok(h.calls.some(c=>Array.isArray(c)&&c[0]==='alert'));});
test('signout continues for same owner after cleanup warning',async()=>{const h=await mount('owner');h.render();h.effects[1]();await flush();const button=all(h.render()).find(n=>n.type==='button'&&n.props.children==='Sign out');const promise=button.props.onClick();h.cleanup.resolve('Server cleanup was not confirmed.');await promise;assert.equal(h.calls.filter(c=>c==='signout').length,1);});
