import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../../supabase/push-foundation.sql',import.meta.url),'utf8');
const edge=await readFile(new URL('../../supabase/functions/daybook-push/index.ts',import.meta.url),'utf8');
test('draft subscription quota uses one owner-locked database transaction',()=>{
 const fn=sql.slice(sql.indexOf('create function public.daybook_push_subscribe'));
 assert.ok(fn.includes('security invoker'));
 assert.ok(fn.indexOf('pg_advisory_xact_lock')<fn.indexOf('select count(*)'));
 assert.ok(fn.indexOf('select count(*)')<fn.indexOf('insert into public.daybook_push_subscriptions'));
 assert.ok(fn.includes('if total>=10'));
 assert.ok(fn.includes('existing_owner<>p_owner'));
 assert.ok(fn.includes('from public,anon,authenticated'));
 assert.ok(edge.includes("db.rpc('daybook_push_subscribe'"));
 assert.ok(!edge.includes("count:'exact'"));
});
test('draft rate limiter is atomic and service-only; scheduler rotates rather than globally blocks',()=>{
 assert.ok(sql.includes('on conflict(owner_id) do update'));
 assert.ok(sql.includes('if total>20'));
 assert.ok(sql.includes('revoke all on function public.daybook_push_limit(uuid) from public,anon,authenticated'));
 assert.ok(edge.includes(".order('checked_at').order('id').limit(101)"));
 assert.ok(!edge.includes('length>500'));
});
