import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(windows=[]){const handlers={},shown=[],opened=[];const self={addEventListener:(name,fn)=>handlers[name]=fn,registration:{scope:'https://example.com/daybook/',showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>windows,openWindow:async(url)=>opened.push(url)}};vm.runInNewContext(source,{self,URL});return {handlers,shown,opened};}
test('push handler always uses generic local content, not payload injection',async()=>{const w=worker();let work;w.handlers.push({data:{json:()=>({title:'Secret',url:'https://evil.test'})},waitUntil:p=>{work=p;}});await work;assert.equal(w.shown[0][0],'Daybook');assert.ok(!JSON.stringify(w.shown).includes('Secret'));assert.equal(w.shown[0][1].icon,'https://example.com/daybook/daybook-192.png');});
test('notification click ignores attacker URL and opens app scope',async()=>{const w=worker();let work,closed=false;w.handlers.notificationclick({notification:{data:{url:'https://evil.test'},close:()=>{closed=true;}},waitUntil:p=>{work=p;}});await work;assert.equal(closed,true);assert.deepEqual(w.opened,['https://example.com/daybook/']);});
test('notification click focuses only same-origin in-scope client',async()=>{let focused=false;const w=worker([{url:'https://evil.test/daybook/',focus:()=>assert.fail()},{url:'https://example.com/daybook/',focus:()=>{focused=true;}}]);let work;w.handlers.notificationclick({notification:{close(){}},waitUntil:p=>{work=p;}});await work;assert.equal(focused,true);assert.deepEqual(w.opened,[]);});
