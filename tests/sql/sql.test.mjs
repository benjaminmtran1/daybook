// Disposable PostgreSQL-WASM, not production. Auth roles/users are synthetic.
// PGlite has one connection: these tests do NOT establish concurrent transaction safety.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const connection='00000000-0000-4000-8000-000000000003',request='00000000-0000-4000-8000-000000000004',lease='00000000-0000-4000-8000-000000000005';
test('draft calendar and push SQL execute in disposable PostgreSQL with isolated roles',async t=>{
 const db=new PGlite();
 const sql=async(query,params=[])=>db.query(query,params);
 const calendar=async(op,owner,input={})=>(await sql('select public.daybook_calendar_repository($1,$2::uuid,$3::jsonb) value',[op,owner,JSON.stringify(input)])).rows[0].value;
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${A}'),('${B}');`);
  await t.test('all three draft files apply unchanged',async()=>{
   for(const name of ['calendar-foundation.sql','calendar-foundation/runtime-repository.sql','push-foundation.sql'])await db.exec(await readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
  });
  await t.test('anonymous/authenticated roles cannot access private tables or service RPCs',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(sql('select * from daybook_private.calendar_connections'),/permission denied/);
    await assert.rejects(sql('select * from public.daybook_push_subscriptions'),/permission denied/);
    await assert.rejects(calendar('connections',A),/permission denied/);
    await assert.rejects(sql('select public.daybook_push_limit($1::uuid)',[A]),/permission denied/);
    await db.exec('reset role');
   }
  });
  await db.exec('set role service_role');
  await t.test('calendar owner filters preserve connection boundaries',async()=>{
   await calendar('save_connection',A,{id:connection,provider:'google',credentials:{ciphertext:'synthetic'},scopes:[]});
   assert.equal((await calendar('connections',A)).length,1);
   assert.deepEqual(await calendar('connections',B),[]);
   assert.equal(await calendar('connection',B,{id:connection}),null);
   await assert.rejects(calendar('select',B,{id:connection,calendars:[]}),/connection unavailable/);
  });
  await t.test('OAuth state is owner/nonce-bound and single-use',async()=>{
   await calendar('put_state',A,{hash:'test-state',connectionId:connection,verifier:{ciphertext:'test'},expiresAt:new Date(Date.now()+60000).toISOString(),redirectUri:'https://example.invalid/callback',nonceHash:'right'});
   assert.equal(await calendar('consume_state',B,{hash:'test-state',nonceHash:'right'}),null);
   assert.equal(await calendar('consume_state',A,{hash:'test-state',nonceHash:'wrong'}),null);
   assert.equal((await calendar('consume_state',A,{hash:'test-state',nonceHash:'right'})).owner_id,A);
   assert.equal(await calendar('consume_state',A,{hash:'test-state',nonceHash:'right'}),null);
  });
  await t.test('calendar refresh lease and create reservation prevent sequential duplicates',async()=>{
   assert.equal(await calendar('claim_refresh',A,{id:connection,lease}),true);
   assert.equal(await calendar('claim_refresh',A,{id:connection,lease:request}),false);
   assert.equal(await calendar('credentials',B,{id:connection,lease,credentials:{}}),false);
   await calendar('release_refresh',A,{id:connection,lease});
   await calendar('select',A,{id:connection,calendars:[{id:'cal',name:'Calendar',writable:true}]});
   const input={id:connection,calendarId:'cal',requestId:request,key:'event-key',payloadHash:'hash'};
   assert.equal(await calendar('reserve',A,input),'new');assert.equal(await calendar('reserve',A,input),'pending');
   assert.equal((await calendar('creation',A,{key:'event-key'})).state,'pending');
   assert.equal(await calendar('creation',B,{key:'event-key'}),null);
   assert.equal(await calendar('reserve',A,{...input,payloadHash:'different'}),'mismatch');
   await calendar('finish',A,{key:'event-key'});assert.equal(await calendar('reserve',A,input),'complete');
  });
  await t.test('atomic no-reservation cancellation fences later creates without cancelling pending work',async()=>{
   const cancelled={id:connection,calendarId:'cal',requestId:'00000000-0000-4000-8000-000000000006',key:'cancel-first',payloadHash:'hash'};
   assert.equal(await calendar('cancel_unreserved',A,cancelled),true);
   assert.equal(await calendar('reserve',A,cancelled),'cancelled');
   assert.equal(await calendar('reserve',A,{...cancelled,payloadHash:'changed'}),'cancelled');
   const pending={...cancelled,requestId:'00000000-0000-4000-8000-000000000007',key:'reserve-first'};
   assert.equal(await calendar('reserve',A,pending),'new');
   assert.equal(await calendar('cancel_unreserved',A,pending),false);
   assert.equal((await calendar('creation',A,{key:pending.key})).state,'pending');
   assert.equal(await calendar('cancel_unreserved',B,pending),false);
   assert.equal((await calendar('creation',A,{key:pending.key})).state,'pending');
  });
  const subscribe=async(owner,endpoint)=>sql('select public.daybook_push_subscribe($1::uuid,$2::jsonb,$3::jsonb)',[owner,JSON.stringify({endpoint,keys:{}}),JSON.stringify({enabled:true})]);
  await t.test('push owner quota and endpoint ownership fail closed',async()=>{
   for(let i=0;i<10;i++)await subscribe(A,'https://example.invalid/'+i);
   await assert.rejects(subscribe(A,'https://example.invalid/extra'),/Device limit/);
   await assert.rejects(subscribe(B,'https://example.invalid/0'),/another account/);
   await subscribe(B,'https://example.invalid/b');
   assert.equal((await sql('select count(*)::int n from public.daybook_push_subscriptions where owner_id=$1',[A])).rows[0].n,10);
  });
  await t.test('push delivery claims deduplicate and cascade after unsubscribe',async()=>{
   const row=(await sql('select id from public.daybook_push_subscriptions where owner_id=$1',[B])).rows[0];
   await sql('insert into public.daybook_push_attempts(subscription_id,event_key) values($1,$2)',[row.id,'today:morning']);
   await assert.rejects(sql('insert into public.daybook_push_attempts(subscription_id,event_key) values($1,$2)',[row.id,'today:morning']),/duplicate key/);
   await sql('delete from public.daybook_push_subscriptions where id=$1',[row.id]);
   assert.equal((await sql('select count(*)::int n from public.daybook_push_attempts where subscription_id=$1',[row.id])).rows[0].n,0);
  });
  await t.test('push and calendar rate limits are executable',async()=>{
   await db.exec('reset role');await sql('delete from public.daybook_push_mutation_limits');await db.exec('set role service_role');
   for(let i=0;i<20;i++)await sql('select public.daybook_push_limit($1::uuid)',[A]);
   await assert.rejects(sql('select public.daybook_push_limit($1::uuid)',[A]),/Too many/);
   for(let i=0;i<60;i++)assert.equal(await calendar('rate_limit',A),true);
   assert.equal(await calendar('rate_limit',A),false);
  });
  await t.test('deleting a synthetic account cascades calendar ledgers and push records',async()=>{
   await db.exec('reset role');await sql('delete from auth.users where id=$1',[A]);
   assert.equal((await sql('select count(*)::int n from daybook_private.calendar_creates where owner_id=$1',[A])).rows[0].n,0);
   assert.equal((await sql('select count(*)::int n from daybook_private.calendar_connections where owner_id=$1',[A])).rows[0].n,0);
   assert.equal((await sql('select count(*)::int n from public.daybook_push_subscriptions where owner_id=$1',[A])).rows[0].n,0);
  });
 }finally{await db.close();}
});
