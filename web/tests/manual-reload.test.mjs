import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {dataSchema,emptyData} from '../model.ts';
function setup(){
 const source=fs.readFileSync(new URL('../Daybook.tsx',import.meta.url),'utf8');
 const load=source.slice(source.indexOf('async function load('),source.indexOf('useEffect(()=>{load();}'));
 const commit=source.slice(source.indexOf('async function commit('),source.indexOf('function go('));
 let release;const effects=[];
 const env={busyRef:{current:false},mountedRef:{current:true},refresh:{invalidate(){}},loaded:true,blocked:false,version:2,dataSchema,today:()=> '2026-10-24',localStorage:{getItem:()=>null},setMessage(){},setBusy(){},setData:x=>effects.push(['data',x]),setVersion:x=>effects.push(['version',x]),setLoaded(){},setBlocked(){},setDate(){},setLegacy(){},setModal(){},fetchWorkspace:async(_path,init)=>{if(init?.method==='PUT'){effects.push(['save']);return new Response(JSON.stringify({version:4}));}return new Promise(resolve=>{release=body=>resolve(new Response(JSON.stringify(body)));});}};
 const javascript=ts.transpile(load+'\n'+commit,{target:ts.ScriptTarget.ESNext});
 const api=new Function('env','with(env){'+javascript+'; return {load,commit};}')(env);
 return {...api,env,effects,release:body=>release(body)};
}
test('manual reload blocks concurrent saves and duplicate reloads',async()=>{
 const h=setup();const loading=h.load();assert.equal(h.env.busyRef.current,true);
 assert.equal(await h.commit(emptyData()),false);await h.load();
 h.release({data:emptyData(),version:3});await loading;
 assert.equal(h.effects.filter(([kind])=>kind==='save').length,0);
 assert.equal(h.env.busyRef.current,false);
 assert.equal(h.effects.filter(([kind])=>kind==='data').length,1);
});
test('manual reload cannot apply old-account data after unmount',async()=>{
 const h=setup();const loading=h.load();h.env.mountedRef.current=false;
 h.release({data:emptyData(),version:3});await loading;
 assert.deepEqual(h.effects,[]);
});
