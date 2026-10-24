import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readPushBody} from '../../supabase/push-foundation/api.ts';
test('body reader accepts bounded JSON',async()=>{assert.deepEqual(await readPushBody(new Request('https://example.test',{method:'POST',body:'{"action":"status"}'})),{action:'status'});});
test('large declared body rejected before reading',async()=>{await assert.rejects(()=>readPushBody(new Request('https://example.test',{method:'POST',body:'{}',headers:{'content-length':'60001'}})),/too large/);});
test('chunked body is canceled on accumulated byte limit even without content-length',async()=>{let canceled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(10000));},cancel(){canceled=true;}});const request=new Request('https://example.test',{method:'POST',body:stream,duplex:'half'});await assert.rejects(()=>readPushBody(request,15000),/too large/);assert.equal(canceled,true);});
test('multibyte text counts encoded bytes rather than characters',async()=>{await assert.rejects(()=>readPushBody(new Request('https://example.test',{method:'POST',body:JSON.stringify('é'.repeat(10))}),15),/too large/);});
