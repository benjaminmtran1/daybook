import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {nextDay,today} from '../model.ts';
import {harness,nodes,text,selectedDay,baseTask} from './form-harness.mjs';

async function openCreation(h,entry){
 if(entry==='today')await h.click('+ Task');
 if(entry==='slot'){h.find(n=>n.props?.className==='empty-slot').props.onClick();h.render();}
 if(entry==='project'){await h.click('Work project');await h.click('Tasks');await h.click('+ Task');}
 if(entry==='capture'){h.find(n=>n.props?.['aria-label']==='Quick capture').props.onClick();h.render();await h.click('Task');}
}
for(const entry of ['today','slot','project','capture'])test(`${entry}: create appends once, preserves all submitted fields and survives reload`,async()=>{
 const h=await harness([baseTask]);await openCreation(h,entry);const defaults=h.defaults();assert.equal(defaults.projectId,entry==='project'?'work':'');assert.equal(defaults.day,entry==='project'?'':entry==='capture'?today():selectedDay);assert.equal(defaults.time,entry==='slot'?'07:00':'');assert.equal(defaults.minutes,'30');assert.equal(defaults.deadline,'');
 await h.submit({title:'New task',projectId:'personal',deadline:'2030-04-15',day:selectedDay,time:'14:15',minutes:'75',priority:'on',repeat:'monthly'});
 assert.equal(h.writes.length,1);const saved=h.remote().tasks;assert.equal(saved.length,2);assert.deepEqual(saved[0],baseTask);assert.notEqual(saved[1].id,baseTask.id);assert.deepEqual({...saved[1],id:'new'},{id:'new',title:'New task',projectId:'personal',deadline:'2030-04-15',day:selectedDay,time:'14:15',minutes:75,done:false,priority:true,repeat:'monthly'});
 assert.ok(text(h.tree).includes('Saved to your private workspace.'));assert.ok(!nodes(h.tree).some(n=>n.props?.name==='title'));
 await h.click('Settings');const originalStorage=globalThis.localStorage;globalThis.localStorage={getItem:()=>null};try{await h.click('Reload cloud data');}finally{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
 await h.click('Today');h.setDate(selectedDay);await h.click('New task');assert.equal(h.defaults().minutes,'75');assert.equal(h.defaults().projectId,'personal');assert.equal(h.defaults().deadline,'2030-04-15');
});
test('existing task edit replaces exactly one record and preserves completion state',async()=>{
 const completed={...baseTask,done:true};const h=await harness([baseTask]);await h.click('Existing task');await h.submit({title:'Edited',projectId:'personal',deadline:'',day:'',time:'',minutes:'120',priority:null,repeat:'daily'});assert.equal(h.remote().tasks.length,1);assert.deepEqual(h.remote().tasks[0],{...baseTask,title:'Edited',projectId:'personal',deadline:'',day:'',time:'',minutes:120,priority:false,repeat:'daily'});
 const doneHarness=await harness([completed]);await doneHarness.click('Work project');await doneHarness.click('Tasks');doneHarness.find(n=>n.props?.type==='checkbox'&&!n.props.name&&!n.props['aria-label']).props.onChange({target:{checked:true}});doneHarness.render();await doneHarness.click('Existing task');await doneHarness.submit({title:'Still completed'});assert.equal(doneHarness.remote().tasks[0].done,true);
});
test('archived assigned project stays selected and survives unchanged save',async()=>{
 const task={...baseTask,projectId:'archived'};const h=await harness([task]);await h.click('Existing task');const html=renderToStaticMarkup(h.form());assert.match(html,/<option value="archived" selected="">Old project · Work · Archived<\/option>/);assert.equal(h.defaults().projectId,'archived');await h.submit();assert.deepEqual(h.remote().tasks,[task]);
 await openCreation(h,'today');assert.ok(!nodes(h.form()).some(n=>n.type==='option'&&n.props.value==='archived'));
});
for(const minutes of [975,1020,1440])test(`valid ${minutes}-minute task retains selected duration on unchanged edit`,async()=>{
 const task={...baseTask,time:'',minutes};const h=await harness([task]);await h.click('Existing task');assert.match(renderToStaticMarkup(h.form()),new RegExp(`<option value="${minutes}" selected="">`));assert.equal(h.defaults().minutes,String(minutes));await h.submit();assert.deepEqual(h.remote().tasks,[task]);
});
for(const [name,overrides,message] of [['missing planned date',{day:'',time:'10:00'},'Choose a planned date'],['overlap',{time:'09:15'},'overlaps'],['midnight overflow',{time:'23:45',minutes:'30'},'past midnight'],['non-quarter-hour duration',{minutes:'20'},'Please check required fields']])test(`new task validation: ${name} keeps draft open and does not save`,async()=>{
 const h=await harness([baseTask]);await openCreation(h,'today');await h.submit({title:'Invalid',...overrides});assert.equal(h.writes.length,0);assert.ok(text(h.tree).includes(message));assert.ok(h.controls().some(n=>n.props.name==='title'));
});
test('Cancel and Escape discard creation defaults without saving; reopening is fresh',async()=>{
 const h=await harness();await openCreation(h,'slot');await h.click('Cancel');assert.equal(h.writes.length,0);await openCreation(h,'today');assert.equal(h.defaults().title,'');assert.equal(h.defaults().time,'');h.find(n=>n.type==='dialog').props.onCancel({preventDefault(){}});h.render();assert.equal(h.writes.length,0);assert.ok(!nodes(h.tree).some(n=>n.props?.name==='title'));
});
test('concurrent repeat submit is guarded and creates only one task',async()=>{
 const h=await harness();await openCreation(h,'today');let release;h.delay=new Promise(resolve=>{release=resolve;});const first=h.submit({title:'Only once'});await h.submit({title:'Duplicate'});assert.equal(h.writes.length,1);release();await first;assert.equal(h.remote().tasks.length,1);assert.equal(h.remote().tasks[0].title,'Only once');
});
test('failed creation retains form and safe retry creates one task',async()=>{
 const h=await harness();await openCreation(h,'today');h.status=500;await h.submit({title:'Retry task'});assert.equal(h.remote().tasks.length,0);assert.ok(h.controls().some(n=>n.props.name==='title'));h.status=200;await h.submit({title:'Retry task'});assert.equal(h.remote().tasks.length,1);
});
test('recurring completion still creates the next task and preserves non-date fields',async()=>{
 const h=await harness([baseTask]);await h.find(n=>n.props?.['aria-label']==='Complete Existing task').props.onChange();h.render();const tasks=h.remote().tasks;assert.equal(tasks.length,2);assert.deepEqual(tasks[0],{...baseTask,done:true,repeat:'none'});assert.deepEqual({...tasks[1],id:baseTask.id},{...baseTask,day:nextDay(selectedDay,'weekly'),deadline:nextDay(baseTask.deadline,'weekly'),time:''});
});
