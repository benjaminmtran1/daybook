import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {dataSchema,emptyData,nextDay,today} from '../model.ts';

// Exercise the real component's entry-point clicks, form defaults, submit and
// completion handlers. Only React lifecycle and network/DOM boundaries are mocked.
// Native browser layout, focus and FormData behavior require separate browser QA.
const moduleUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const hooks=moduleUrl(`export default {};
export const useState=initial=>{const h=globalThis.__taskFormHarness,i=h.stateIndex++;if(!(i in h.states))h.states[i]=typeof initial==='function'?initial():initial;return[h.states[i],value=>h.states[i]=typeof value==='function'?value(h.states[i]):value]};
export const useRef=initial=>{const h=globalThis.__taskFormHarness,i=h.refIndex++;return h.refs[i]??={current:initial}};
export const useEffect=()=>{};`);
const backend=moduleUrl('export const daybookFetch=(...args)=>globalThis.__taskFormHarness.fetch(...args);export const receiptUrl=()=>{};');
const refresh=moduleUrl("export const useWorkspaceRefresh=()=>({invalidate(){},status:''});");
const stub=moduleUrl('export default ()=>null;export const CalendarAgenda=()=>null;');
const source=await readFile(new URL('../Daybook.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
 .replace(/from ['"]react\/jsx-runtime['"]/,`from '${import.meta.resolve('react/jsx-runtime')}'`)
 .replace(/from ['"]react['"]/,`from '${hooks}'`)
 .replace(/from ['"]\.\/model['"]/,`from '${new URL('../model.ts',import.meta.url).href}'`)
 .replace(/from ['"]\.\/backend['"]/,`from '${backend}'`)
 .replace(/from ['"]\.\/useWorkspaceRefresh['"]/,`from '${refresh}'`)
 .replace(/from ['"]\.\/export-format['"]/,`from '${new URL('../export-format.ts',import.meta.url).href}'`)
 .replace(/from ['"]\.\/(?:TaskFocus|ReceiptOCR|DeviceReminders|CalendarConnections|LiveCalendarConnections|PushReminders)['"]/g,`from '${stub}'`);
const {default:Daybook}=await import(moduleUrl(compiled));
function nodes(tree){return tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join('');return typeof tree==='string'||typeof tree==='number'?String(tree):tree&&typeof tree==='object'?text(tree.props?.children):'';}
const selectedDay='2030-04-12';
const baseTask={id:'existing',title:'Existing task',projectId:'work',deadline:'2030-04-20',day:selectedDay,time:'09:00',minutes:45,done:false,priority:true,repeat:'weekly'};
async function harness(tasks=[]){
 let remote=emptyData(),version=1;remote.projects=[{id:'work',name:'Work project',clientId:'',space:'Work',deadline:'2030-05-01',archived:false},{id:'personal',name:'Personal project',clientId:'',space:'Personal',deadline:'',archived:false},{id:'archived',name:'Old project',clientId:'',space:'Work',deadline:'',archived:true}];remote.tasks=structuredClone(tasks);
 const h={states:[],refs:[],stateIndex:0,refIndex:0,writes:[],status:200,delay:null};
 h.fetch=async(path,init={})=>{assert.equal(path,'/api/workspace');if(init.method==='PUT'){const body=JSON.parse(init.body);h.writes.push(body);assert.equal(body.version,version);if(h.delay)await h.delay;if(h.status!==200)return{ok:false,status:h.status,json:async()=>({error:'Synthetic save failure'})};assert.equal(dataSchema.safeParse(body.data).success,true);remote=structuredClone(body.data);version++;}return{ok:true,json:async()=>({data:structuredClone(remote),version})};};
 h.render=()=>{globalThis.__taskFormHarness=h;h.stateIndex=h.refIndex=0;return h.tree=Daybook({ownerId:'synthetic-owner'});};
 h.find=(predicate)=>{const node=nodes(h.tree).find(predicate);assert.ok(node,'Expected rendered control');return node;};
 h.click=async label=>{await h.find(n=>typeof n.props?.onClick==='function'&&text(n)===label).props.onClick();h.render();};
 h.form=()=>h.find(n=>n.type==='form');
 h.controls=()=>nodes(h.form()).filter(n=>n.props?.name&&(n.type==='input'||n.type?.name==='Field'||n.type?.name==='Pick'));
 h.defaults=()=>Object.fromEntries(h.controls().flatMap(n=>{const p=n.props;if(p.type==='checkbox')return p.defaultChecked?[[p.name,'on']]:[];if(n.type?.name==='Pick'){const options=nodes(n).filter(o=>o.type==='option'),value=o=>String(o.props.value??text(o));const selected=options.find(o=>value(o)===String(p.defaultValue))||options[0];return [[p.name,value(selected)]];}return [[p.name,String(p.defaultValue??'')]];}));
 h.submit=async(overrides={})=>{const values={...h.defaults(),...overrides},Original=globalThis.FormData;globalThis.FormData=class{constructor(form){this.values=form;}get(name){return this.values[name]??null;}};try{await h.form().props.onSubmit({preventDefault(){},currentTarget:values});}finally{globalThis.FormData=Original;h.render();}};
 h.remote=()=>structuredClone(remote);
 h.setDate=value=>{h.find(n=>n.props?.label==='Date'&&n.props.onChange).props.onChange({target:{value}});h.render();};
 h.render();const originalStorage=globalThis.localStorage;globalThis.localStorage={getItem:()=>null};try{await h.click('Retry');}finally{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
 h.setDate(selectedDay);return h;
}
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
