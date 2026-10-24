import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dataSchema,emptyData} from '../model.ts';
test('complete existing-format backup roundtrips all known record fields on patched Zod',()=>{
 const data=emptyData();
 data.clients=[{id:'c',name:'Example Client',email:'client@example.invalid',address:'1 Test Street\nToronto',terms:'Net 30'}];
 data.projects=[{id:'p',name:'Example Project',clientId:'c',space:'Work',deadline:'2026-12-31',archived:false},{id:'personal',name:'Personal',clientId:'',space:'Personal',deadline:'',archived:true}];
 data.tasks=[{id:'t',title:'Repeat task',projectId:'p',deadline:'2026-12-31',day:'2026-10-24',time:'09:15',minutes:45,done:false,priority:true,repeat:'monthly'},{id:'done',title:'Unscheduled complete',projectId:'',deadline:'',day:'',time:'',minutes:30,done:true,priority:false,repeat:'none'}];
 data.notes=[{id:'n',projectId:'p',title:'Measurements',body:'# Café 測試\nlength = 3/4\n10 × 4 =\n'}];
 data.expenses=[{id:'e',projectId:'p',merchant:'Example Shop',date:'2026-10-24',total:11.30,tax:1.30,fileId:'original-owner/original-file',fileName:'original receipt.pdf',submitted:true,invoiceId:'i'}];
 data.events=[{id:'ev',title:'Local event',day:'2026-10-24',time:'11:45',minutes:15,space:'Personal'}];
 data.seller={name:'Example Seller',email:'seller@example.invalid',address:'2 Example Avenue',taxId:'EXAMPLE-ONLY',payment:'Example payment instructions'};
 data.invoices=[{id:'i',projectId:'p',projectName:'Original project name',number:'INV-001',date:'2026-10-24',due:'2026-11-24',client:{...data.clients[0],name:'Original snapshot client'},seller:{...data.seller,name:'Original snapshot seller'},items:[{description:'Original work',qty:7.5,rate:65}],expenseIds:['e'],expenses:[{merchant:'Original merchant',total:11.30}],taxRate:13,terms:'Original snapshot terms',status:'sent'}];
 const backup=JSON.parse(JSON.stringify({format:'daybook-1',exported:'2026-10-24T00:00:00.000Z',data}));
 const restored=dataSchema.parse(backup.data);
 assert.deepEqual(restored,data);assert.deepEqual(dataSchema.parse(JSON.parse(JSON.stringify(restored))),data);
 assert.equal(restored.expenses[0].fileId,'original-owner/original-file');assert.equal(restored.invoices[0].client.name,'Original snapshot client');
});
test('patched schema still rejects invalid amounts and oversized collections',()=>{
 const data=emptyData();assert.equal(dataSchema.safeParse({...data,clients:new Array(2001).fill({})}).success,false);
 assert.equal(dataSchema.safeParse({...data,expenses:[{id:'e',projectId:'',merchant:'Shop',date:'2026-10-24',total:Infinity,tax:0,fileId:'',fileName:'',submitted:false,invoiceId:''}]}).success,false);
});
