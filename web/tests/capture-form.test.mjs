import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {today} from '../model.ts';
import {harness,nodes,text} from './form-harness.mjs';

const note={id:'note-existing',projectId:'work',title:'Existing note',body:'# Measurements\n\n  Preserve spacing.\n'};
const expense={id:'expense-existing',projectId:'work',merchant:'Existing expense',date:'2030-04-10',total:113.75,tax:13.09,fileId:'synthetic/original.png',fileName:'Original receipt.png',submitted:true,invoiceId:''};
async function capture(h,kind){h.find(n=>n.props?.['aria-label']==='Quick capture').props.onClick();h.render();await h.click(kind);}
async function reload(h){await h.click('Settings');const originalStorage=globalThis.localStorage;globalThis.localStorage={getItem:()=>null};try{await h.click('Reload cloud data');}finally{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}}
async function projectSection(h,section,archived=false){if(archived){await h.click('Work');await h.click('Old project');}else await h.click('Work project');if(section!=='Notes')await h.click(section);}

test('quick-capture Note appends once, preserves entered fields and survives reload',async()=>{
 const h=await harness([],{notes:[note]});await capture(h,'Note');assert.equal(h.defaults().projectId,'');assert.equal(h.defaults().title,'');assert.equal(h.defaults().body,'');
 const fields={title:'Captured note',projectId:'work',body:'# New note\n\n  Spacing stays.\n'};await h.submit(fields);assert.equal(h.writes.length,1);const saved=h.remote().notes;assert.equal(saved.length,2);assert.deepEqual(saved[0],note);assert.notEqual(saved[1].id,note.id);assert.deepEqual({...saved[1],id:'new'},{id:'new',...fields});assert.ok(text(h.tree).includes('Saved to your private workspace.'));
 await reload(h);await projectSection(h,'Notes');await h.click('Captured note');await h.click('Edit note');assert.deepEqual(h.defaults(),fields);
});
test('quick-capture Expense appends once with attachment, reviewed amounts and date',async()=>{
 const h=await harness([],{expenses:[expense]});await capture(h,'Expense');assert.equal(h.defaults().projectId,'');assert.equal(h.defaults().date,today());assert.equal(h.defaults().tax,'0');
 const file=new File(['synthetic bytes'],'receipt.png',{type:'image/png'});await h.submit({merchant:'Captured expense',projectId:'work',date:'2030-04-11',total:'56.50',tax:'6.50',file});assert.equal(h.writes.length,1);assert.equal(h.uploads.length,1);const saved=h.remote().expenses;assert.equal(saved.length,2);assert.deepEqual(saved[0],expense);assert.notEqual(saved[1].id,expense.id);assert.deepEqual({...saved[1],id:'new'},{id:'new',merchant:'Captured expense',projectId:'work',date:'2030-04-11',total:56.5,tax:6.5,fileId:'synthetic/receipt.png',fileName:'receipt.png',submitted:false,invoiceId:''});
 await reload(h);await projectSection(h,'Expenses');const row=h.find(n=>n.props?.className==='expense-row'&&text(n).includes('Captured expense'));nodes(row).find(n=>text(n)==='Edit'&&n.props.onClick).props.onClick();h.render();assert.equal(h.defaults().merchant,'Captured expense');assert.equal(h.defaults().date,'2030-04-11');assert.equal(h.defaults().total,'56.5');assert.equal(h.defaults().tax,'6.5');assert.ok(text(h.tree).includes('receipt.png'));
});
for(const [kind,collection,titleField,fields] of [['Note','notes','title',{title:'Unfiled note',body:'Plain text'}],['Expense','expenses','merchant',{merchant:'Unfiled expense',date:'2030-04-11',total:'10',tax:'0'}]])test(`${kind}: unfiled quick capture remains in Inbox`,async()=>{
 const h=await harness();await capture(h,kind);await h.submit(fields);assert.equal(h.remote()[collection].length,1);assert.equal(h.remote()[collection][0].projectId,'');await h.click('Inbox');assert.ok(text(h.tree).includes(fields[titleField]));
});
test('existing Note edit updates only its record and preserves Markdown whitespace',async()=>{
 const h=await harness([],{notes:[note,{...note,id:'other',title:'Other note'}]});await projectSection(h,'Notes');await h.click('Edit');assert.equal(h.defaults().body,note.body);const fields={title:'Edited note',projectId:'personal',body:'  first line\n\n- [ ] task\n'};await h.submit(fields);assert.equal(h.remote().notes.length,2);assert.deepEqual(h.remote().notes[0],{...note,...fields});assert.equal(h.remote().notes[1].title,'Other note');
});
test('existing Expense edit preserves attachment and submission state without upload',async()=>{
 const h=await harness([],{expenses:[expense]});await projectSection(h,'Expenses');await h.click('Edit');assert.equal(h.defaults().total,'113.75');assert.equal(h.defaults().tax,'13.09');await h.submit({merchant:'Edited expense',projectId:'personal',date:'2030-04-12',total:'200.25',tax:'23.04'});assert.equal(h.uploads.length,0);assert.deepEqual(h.remote().expenses,[{...expense,merchant:'Edited expense',projectId:'personal',date:'2030-04-12',total:200.25,tax:23.04}]);
});
for(const [kind,section,collection,record] of [['Note','Notes','notes',note],['Expense','Expenses','expenses',expense]])test(`${kind}: archived project stays selected and unchanged edit preserves all fields`,async()=>{
 const archived={...record,projectId:'archived'},h=await harness([],{[collection]:[archived]});await projectSection(h,section,true);await h.click('Edit');assert.match(renderToStaticMarkup(h.form()),/<option value="archived" selected="">Old project · Work · Archived<\/option>/);await h.submit();assert.deepEqual(h.remote()[collection],[archived]);await capture(h,kind);assert.ok(!nodes(h.form()).some(n=>n.type==='option'&&n.props.value==='archived'));
});
for(const [kind,fields,message] of [['Note',{title:'',body:'Keep draft'},'Please check required fields'],['Expense',{merchant:'Invalid tax',total:'10',tax:'11'},'Included tax cannot exceed'],['Expense',{merchant:'Negative amount',total:'-1',tax:'0'},'Included tax cannot exceed']])test(`${kind}: invalid ${JSON.stringify(fields)} does not save or close the form`,async()=>{
 const h=await harness();await capture(h,kind);await h.submit(fields);assert.equal(h.writes.length,0);assert.ok(text(h.tree).includes(message));assert.ok(h.controls().length>0);
});
for(const [kind,collection,fields] of [['Note','notes',{title:'Only once',body:'Body'}],['Expense','expenses',{merchant:'Only once',total:'10',tax:'0'}]])test(`${kind}: concurrent repeat submit creates only one record`,async()=>{
 const h=await harness();await capture(h,kind);let release;h.delay=new Promise(resolve=>{release=resolve;});const first=h.submit(fields);await h.submit(fields);assert.equal(h.writes.length,1);release();await first;assert.equal(h.remote()[collection].length,1);
});
test('Expense: failed save retries once without reuploading the same receipt',async()=>{
 const h=await harness();await capture(h,'Expense');const fields={merchant:'Retry expense',total:'11.30',tax:'1.30',file:new File(['synthetic bytes'],'receipt.png',{type:'image/png'})};h.status=500;await h.submit(fields);assert.equal(h.remote().expenses.length,0);assert.equal(h.uploads.length,1);assert.ok(h.controls().length>0);h.status=200;await h.submit(fields);assert.equal(h.remote().expenses.length,1);assert.equal(h.uploads.length,1);assert.equal(h.remote().expenses[0].fileId,'synthetic/receipt.png');
});
test('Note: failed save retains form and retry creates one note',async()=>{
 const h=await harness();await capture(h,'Note');h.status=500;await h.submit({title:'Retry note',body:'Unlost text'});assert.equal(h.remote().notes.length,0);assert.ok(h.controls().length>0);h.status=200;await h.submit({title:'Retry note',body:'Unlost text'});assert.equal(h.remote().notes.length,1);
});
for(const kind of ['Note','Expense'])test(`${kind}: Cancel and Escape do not save and reopening has fresh defaults`,async()=>{
 const h=await harness();await capture(h,kind);await h.click('Cancel');assert.equal(h.writes.length,0);await capture(h,kind);assert.equal(h.defaults()[kind==='Note'?'title':'merchant'],'');h.find(n=>n.type==='dialog').props.onCancel({preventDefault(){}});h.render();assert.equal(h.writes.length,0);assert.ok(!nodes(h.tree).some(n=>n.props?.name===(kind==='Note'?'title':'merchant')));
});
for(const [kind,section,collection,fields] of [['Note','Notes','notes',{title:'Project note',body:'Project text'}],['Expense','Expenses','expenses',{merchant:'Project expense',date:'2030-04-11',total:'15.25',tax:'1.75'}]])test(`project + ${kind}: direct creation still appends with the current project`,async()=>{
 const h=await harness();await projectSection(h,section);await h.click('+ '+kind);assert.equal(h.defaults().projectId,'work');await h.submit(fields);assert.equal(h.writes.length,1);assert.equal(h.remote()[collection].length,1);assert.equal(h.remote()[collection][0].projectId,'work');
});
