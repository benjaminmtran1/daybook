import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {dataSchema,emptyData} from '../model.ts';

// Exercise the production adapter with a fake SDK, never real account or storage APIs.
function setup(){
  const state={session:{access_token:'token-A',user:{id:'A'}},verifiedOwner:'A',onVerify:null,calls:[],clients:[]};
  const auth={
    async getSession(){return {data:{session:state.session},error:null};},
    async getUser(token){state.calls.push({kind:'verify',token});await state.onVerify?.();return {data:{user:{id:state.verifiedOwner}},error:null};},
  };
  function createClient(_url,_key,options){
    const client={auth,
      async rpc(name,args){state.calls.push({kind:'rpc',token:await options?.accessToken?.(),name,args});return {data:3,error:null};},
      from(table){return {select(){return {eq(column,owner){return {async maybeSingle(){state.calls.push({kind:'read',token:await options?.accessToken?.(),table,column,owner});return {data:{payload:emptyData(),version:2},error:null};}};}};}};},
      storage:{from(bucket){return {
        async upload(id,file){state.calls.push({kind:'upload',token:await options?.accessToken?.(),bucket,id,file});return {error:null};},
        async createSignedUrl(id,seconds){state.calls.push({kind:'sign',token:await options?.accessToken?.(),bucket,id,seconds});return {data:{signedUrl:'https://example.invalid/receipt'},error:null};},
      };}},
    };
    state.clients.push({options,client});return client;
  }
  const source=fs.readFileSync(new URL('../backend.ts',import.meta.url),'utf8')
    .replace(/^import .*?;\s*$/gm,'').replace(/\bexport\s+/g,'');
  const javascript=ts.transpile(source,{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext});
  const api=new Function('createClient','dataSchema','emptyData',javascript+'\nreturn {daybookFetch,receiptUrl};')(createClient,dataSchema,emptyData);
  return {...api,state};
}
const save=()=>({method:'PUT',body:JSON.stringify({data:emptyData(),version:2})});
const effects=state=>state.calls.filter(call=>call.kind!=='verify');

test('workspace writes fail closed when the active account differs from the caller',async()=>{
  const h=setup();h.state.session={access_token:'token-B',user:{id:'B'}};h.state.verifiedOwner='B';
  const response=await h.daybookFetch('/api/workspace',save(),'A');
  assert.equal(response.ok,false);assert.deepEqual(effects(h.state),[]);
});
test('workspace reads fail closed when the active account differs from the caller',async()=>{
  const h=setup();h.state.session={access_token:'token-B',user:{id:'B'}};h.state.verifiedOwner='B';
  const response=await h.daybookFetch('/api/workspace',undefined,'A');
  assert.equal(response.ok,false);assert.deepEqual(effects(h.state),[]);
});
test('a locally claimed owner is not enough without verifying the captured credential',async()=>{
  const h=setup();h.state.verifiedOwner='B';
  const response=await h.daybookFetch('/api/workspace',save(),'A');
  assert.equal(response.ok,false);assert.deepEqual(effects(h.state),[]);
});
test('missing sessions cannot perform workspace mutations',async()=>{
  const h=setup();h.state.session=null;
  const response=await h.daybookFetch('/api/workspace',save(),'A');
  assert.equal(response.ok,false);assert.deepEqual(effects(h.state),[]);
});
test('an account switch during credential verification cannot redirect an already-authorized save',async()=>{
  const h=setup();h.state.onVerify=()=>{h.state.session={access_token:'token-B',user:{id:'B'}};};
  const response=await h.daybookFetch('/api/workspace',save(),'A');
  assert.equal(response.ok,true);
  assert.equal(h.state.calls.find(call=>call.kind==='verify').token,'token-A');
  assert.equal(h.state.calls.find(call=>call.kind==='rpc').token,'token-A');
});
test('workspace reads bind both owner filter and token to the captured account',async()=>{
  const h=setup();h.state.onVerify=()=>{h.state.session={access_token:'token-B',user:{id:'B'}};};
  const response=await h.daybookFetch('/api/workspace',undefined,'A');
  assert.equal(response.ok,true);
  const call=h.state.calls.find(call=>call.kind==='read');assert.equal(call.owner,'A');assert.equal(call.token,'token-A');
});
test('receipt uploads bind the storage path and request credential to the same owner',async()=>{
  const h=setup();h.state.onVerify=()=>{h.state.session={access_token:'token-B',user:{id:'B'}};};
  const form=new FormData();form.set('file',new File(['receipt'],'receipt.pdf',{type:'application/pdf'}));
  const response=await h.daybookFetch('/api/files',{method:'POST',body:form},'A');
  assert.equal(response.ok,true);
  const call=h.state.calls.find(call=>call.kind==='upload');assert.match(call.id,/^A\//);assert.equal(call.token,'token-A');
});

// Exercise the actual component's mutation continuations without rendering or networking.
function expenseHarness(fetchWorkspace){
  const source=fs.readFileSync(new URL('../Daybook.tsx',import.meta.url),'utf8');
  const commit=source.slice(source.indexOf('async function commit('),source.indexOf('function go('));
  const submit=source.slice(source.indexOf('async function submit('),source.indexOf('function exportEvent('));
  const form=new FormData();
  for(const [key,value] of Object.entries({merchant:'Private merchant',date:'2026-10-24',total:'10',tax:'1',projectId:''}))form.set(key,value);
  form.set('file',new File(['receipt'],'receipt.pdf',{type:'application/pdf'}));
  const env={loaded:true,mountedRef:{current:true},uploadedReceipt:{current:null},busyRef:{current:false},submittingRef:{current:false},blocked:false,version:2,data:emptyData(),modal:{kind:'expense'},dataSchema,refresh:{invalidate(){}},FormData:class{constructor(){return form;}},File,structuredClone,uid:()=> 'expense-1',setMessage(){},setBusy(){},setData(){},setVersion(){},setBlocked(){},close(){},fetchWorkspace};
  const javascript=ts.transpile(commit+'\n'+submit,{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext});
  const run=new Function('env','with(env){'+javascript+'; return submit;}')(env);
  return {env,submit:()=>run({preventDefault(){},currentTarget:{}})};
}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('unmounting during receipt upload prevents the subsequent workspace write',async()=>{
  let finish;let saves=0;
  const h=expenseHarness(async path=>{if(path==='/api/files')return new Promise(resolve=>{finish=()=>resolve(response({id:'A/receipt',name:'receipt.pdf'}));});saves++;return response({version:3});});
  const pending=h.submit();h.env.mountedRef.current=false;finish();await pending;
  assert.equal(saves,0);
});
test('repeated receipt submit during an upload performs only one upload and save',async()=>{
  let finish;let uploads=0,saves=0;
  const h=expenseHarness(async path=>{if(path==='/api/files'){uploads++;return new Promise(resolve=>{finish=()=>resolve(response({id:'A/receipt',name:'receipt.pdf'}));});}saves++;return response({version:3});});
  const pending=h.submit();await h.submit();finish();await pending;
  assert.equal(uploads,1);assert.equal(saves,1);
});
test('retrying a failed workspace save reuses the successful receipt upload and captured form fields',async()=>{
  let uploads=0;const writes=[];
  const h=expenseHarness(async(path,init)=>{if(path==='/api/files'){uploads++;return response({id:'A/receipt',name:'receipt.pdf'});}writes.push(JSON.parse(init.body));return writes.length===1?response({error:'Temporarily unavailable'},400):response({version:3});});
  await h.submit();await h.submit();
  assert.equal(uploads,1);assert.equal(writes.length,2);
  assert.equal(writes[1].data.expenses[0].merchant,'Private merchant');assert.equal(writes[1].data.expenses[0].fileId,'A/receipt');
});
