import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as React from 'react';
const source=await readFile(new URL('../PushReminders.tsx',import.meta.url),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
let version=0;
async function mount(){
 const states=[],refs=[],effects=[];let s=0,r=0;const status=deferred(),enable=deferred();let calls=0;
 globalThis.__pushUi={useState(initial){const index=s++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],v=>{states[index]=typeof v==='function'?v(states[index]):v;}];},useRef(value){return refs[r++]|| (refs[r-1]={current:value});},useEffect(fn){effects.push(fn);},client:{pushConfigured:true,pushAvailable:()=>true,pushStatus:()=>status.promise,enableDevicePush:()=>{calls++;return enable.promise;},disconnectDevicePush:async()=>{},savePushPreferences:async()=>{}}};
 const hook='data:text/javascript,'+encodeURIComponent('export const {useState,useRef,useEffect}=globalThis.__pushUi; // '+(++version));
 const client='data:text/javascript,'+encodeURIComponent('export const {pushConfigured,pushAvailable,pushStatus,enableDevicePush,disconnectDevicePush,savePushPreferences}=globalThis.__pushUi.client; // '+version);
 let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace("from 'react'",`from '${hook}'`).replace('from "react/jsx-runtime"',`from '${import.meta.resolve('react/jsx-runtime')}'`).replace("from './push-client'",`from '${client}'`).replace("from '../supabase/push-foundation/core'",`from '${new URL('../../supabase/push-foundation/core.ts',import.meta.url).href}'`);
 const {default:Component}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 return {render(){s=0;r=0;return Component({ownerId:'owner',tasks:[]});},effects,status,enable,get calls(){return calls;}};
}
function all(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(all)];}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('controls stay disabled until initial device status has settled',async()=>{const h=await mount();let tree=h.render();assert.equal(all(tree).find(n=>n.type==='fieldset').props.disabled,true);h.effects[0]();h.status.resolve(null);await flush();tree=h.render();assert.equal(all(tree).find(n=>n.type==='fieldset').props.disabled,false);});
test('same-tick repeated Enable clicks create one permission/subscription flow',async()=>{const h=await mount();h.render();h.effects[0]();h.status.resolve(null);await flush();const tree=h.render();const button=all(tree).find(n=>n.type==='button'&&n.props.children==='Enable notifications on this device');const a=button.props.onClick(),b=button.props.onClick();assert.equal(h.calls,1);h.enable.resolve();await Promise.all([a,b]);});
test('late status response after unmount is ignored',async()=>{const h=await mount();h.render();const cleanup=h.effects[0]();cleanup();h.status.resolve({enabled:true,timeZone:'Europe/London',morning:'09:00',evening:null,due:null,quietStart:'00:00',quietEnd:'00:00',taskAlerts:[]});await flush();const tree=h.render();assert.equal(all(tree).find(n=>n.type==='input'&&n.props.placeholder==='America/Toronto').props.value,'America/Toronto');});
