import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceRefresh} from '../workspace-refresh.ts';
function setup(){
 let version=2,enabled=true,reads=0,status='',applied=[];
 let resolve,reject;
 const sync=createWorkspaceRefresh({read:()=>{reads++;return new Promise((a,b)=>{resolve=a;reject=b;});},canRefresh:()=>enabled,version:()=>version,apply:s=>{applied.push(s);version=s.version;},status:s=>{status=s;}});
 return {sync,get reads(){return reads;},get applied(){return applied;},get status(){return status;},set enabled(x){enabled=x;},set version(x){version=x;},resolve:s=>resolve(s),reject:()=>reject(Error('offline'))};
}
test('new remote revision is applied, overlapping reads are coalesced',async()=>{const h=setup();const p=h.sync.refresh();await h.sync.refresh();assert.equal(h.reads,1);h.resolve({version:3,data:{tasks:['remote']}});await p;assert.equal(h.applied.length,1);assert.match(h.status,/other device/);});
test('same and older revisions never replace local data',async()=>{for(const version of [1,2]){const h=setup();const p=h.sync.refresh();h.resolve({version,data:{}});await p;assert.equal(h.applied.length,0);}});
test('editing, saving, conflict, hidden/offline eligibility prevents reads',async()=>{const h=setup();h.enabled=false;await h.sync.refresh();assert.equal(h.reads,0);});
test('opening then closing a draft while read is in flight invalidates it',async()=>{const h=setup();const p=h.sync.refresh();h.sync.invalidate();h.resolve({version:3,data:{}});await p;assert.equal(h.applied.length,0);});
test('a save changing revision during refresh cannot be overwritten',async()=>{const h=setup();const p=h.sync.refresh();h.version=4;h.resolve({version:3,data:{}});await p;assert.equal(h.applied.length,0);});
test('pending changes blocked before a read returns are preserved',async()=>{const h=setup();const p=h.sync.refresh();h.enabled=false;h.resolve({version:3,data:{}});await p;assert.equal(h.applied.length,0);});
test('unmount/sign-out ignores late responses and future refreshes',async()=>{const h=setup();const p=h.sync.refresh();h.sync.dispose();h.resolve({version:3,data:{}});await p;await h.sync.refresh();assert.equal(h.applied.length,0);assert.equal(h.reads,1);});
test('offline read failure preserves data and a later read recovers',async()=>{const h=setup();const p=h.sync.refresh();h.reject();await p;assert.match(h.status,/retrying/);assert.equal(h.applied.length,0);const q=h.sync.refresh();h.resolve({version:3,data:{}});await q;assert.equal(h.applied.length,1);});
test('invalid revision fails closed',async()=>{const h=setup();const p=h.sync.refresh();h.resolve({version:'3',data:{}});await p;assert.equal(h.applied.length,0);assert.match(h.status,/Could not check/);});

test('a hung read times out without blocking later refresh or applying late data',async()=>{
 let reads=0,late,applied=[];
 const sync=createWorkspaceRefresh({timeoutMs:5,canRefresh:()=>true,version:()=>1,status(){},apply:s=>applied.push(s),read:()=>++reads===1?new Promise(resolve=>{late=resolve;}):Promise.resolve({version:2,data:{}})});
 await sync.refresh();await sync.refresh();late({version:99,data:{}});await Promise.resolve();
 assert.equal(reads,2);assert.deepEqual(applied.map(s=>s.version),[2]);sync.dispose();
});
