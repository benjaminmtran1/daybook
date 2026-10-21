import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { dataSchema,emptyData } from '../lib/daybook.ts';
const db=new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../drizzle/0000_square_prism.sql',import.meta.url),'utf8'));
const env={DB:{prepare(sql){
  return {bind(...params){
    return {
      async first(){return db.prepare(sql).get(...params)||null;},
      async run(){return {meta:{changes:db.prepare(sql).run(...params).changes}};}
    };
  }};
}}};
let user={userId:'owner-a',email:'a@example.test'};
function routes(path){let source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export async function (\w+)\(/g,'globalThis.routes.$1 = async function (');source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export {};','');const context={routes:{},env,getChatGPTUser:async()=>user,dataSchema,emptyData,Response,Request,File,URL,crypto,console};vm.createContext(context);vm.runInContext(source,context);return context.routes;}
const api=routes('../app/api/workspace/route.ts');
const request=(body,origin='https://daybook.test')=>new Request('https://daybook.test/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
assert.equal((await api.GET()).status,200);
assert.equal((await (await api.GET()).json()).version,0);
const data=emptyData();data.clients.push({id:'client',name:'Private client',email:'',address:'',terms:''});
assert.equal((await api.PUT(request({data,version:0}))).status,200);
assert.equal((await (await api.GET()).json()).data.clients[0].name,'Private client');
assert.equal((await api.PUT(request({data,version:0}))).status,409);
assert.equal((await api.PUT(request({data,version:1},'https://untrusted.test'))).status,403);
assert.equal((await api.PUT(request({data:{},version:1}))).status,400);
assert.equal((await api.PUT(request({data,version:1}))).status,200);
user={userId:'owner-b',email:'b@example.test'};
assert.equal((await (await api.GET()).json()).data.clients.length,0);
user=null;
assert.equal((await api.GET()).status,401);
assert.equal((await api.PUT(request({data,version:2}))).status,401);
const store=new Map();env.BUCKET={async put(key,bytes,meta){store.set(key,{body:bytes,...meta});},async get(key){return store.get(key)||null;}};
const files=routes('../app/api/files/route.ts');user={userId:'owner-a',email:'a@example.test'};
const form=new FormData();form.set('file',new File(['receipt'],'receipt.png',{type:'image/png'}));
const upload=await files.POST(new Request('https://daybook.test/api/files',{method:'POST',headers:{origin:'https://daybook.test'},body:form}));assert.equal(upload.status,200);const saved=await upload.json();
assert.equal((await files.GET(new Request('https://daybook.test/api/files?id='+saved.id))).status,200);
user={userId:'owner-b',email:'b@example.test'};
assert.equal((await files.GET(new Request('https://daybook.test/api/files?id='+saved.id))).status,404);
console.log('PASS: actual API handlers with local SQLite/R2 substitutes — durable writes, revision conflicts, validation, origin checks, missing identity and cross-user isolation for records/files.');
