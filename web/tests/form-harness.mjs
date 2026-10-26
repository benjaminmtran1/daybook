import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
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
export function nodes(tree){return tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)]:[];}
export function text(tree){if(Array.isArray(tree))return tree.map(text).join('');return typeof tree==='string'||typeof tree==='number'?String(tree):tree&&typeof tree==='object'?text(tree.props?.children):'';}
export const selectedDay='2030-04-12';
export const baseTask={id:'existing',title:'Existing task',projectId:'work',deadline:'2030-04-20',day:selectedDay,time:'09:00',minutes:45,done:false,priority:true,repeat:'weekly'};
export async function harness(tasks=[],records={}){
 let remote=emptyData(),version=1;remote.projects=[{id:'work',name:'Work project',clientId:'',space:'Work',deadline:'2030-05-01',archived:false},{id:'personal',name:'Personal project',clientId:'',space:'Personal',deadline:'',archived:false},{id:'archived',name:'Old project',clientId:'',space:'Work',deadline:'',archived:true}];remote.tasks=structuredClone(tasks);remote.notes=structuredClone(records.notes||[]);remote.expenses=structuredClone(records.expenses||[]);
 const h={states:[],refs:[],stateIndex:0,refIndex:0,writes:[],uploads:[],status:200,delay:null};
 h.fetch=async(path,init={})=>{if(path==='/api/files'){h.uploads.push(init.body);return{ok:true,json:async()=>({id:'synthetic/receipt.png',name:'receipt.png'})};}assert.equal(path,'/api/workspace');if(init.method==='PUT'){const body=JSON.parse(init.body);h.writes.push(body);assert.equal(body.version,version);if(h.delay)await h.delay;if(h.status!==200)return{ok:false,status:h.status,json:async()=>({error:'Synthetic save failure'})};assert.equal(dataSchema.safeParse(body.data).success,true);remote=structuredClone(body.data);version++;}return{ok:true,json:async()=>({data:structuredClone(remote),version})};};
 h.render=()=>{globalThis.__taskFormHarness=h;h.stateIndex=h.refIndex=0;return h.tree=Daybook({ownerId:'synthetic-owner'});};
 h.find=(predicate)=>{const node=nodes(h.tree).find(predicate);assert.ok(node,'Expected rendered control');return node;};
 h.click=async label=>{await h.find(n=>typeof n.props?.onClick==='function'&&text(n)===label).props.onClick();h.render();};
 h.form=()=>h.find(n=>n.type==='form');
 h.controls=()=>nodes(h.form()).filter(n=>n.props?.name&&(n.type==='input'||n.type?.name==='Field'||n.type?.name==='Pick'||n.type?.name==='Area'));
 h.defaults=()=>Object.fromEntries(h.controls().flatMap(n=>{const p=n.props;if(p.type==='file')return [];if(p.type==='checkbox')return p.defaultChecked?[[p.name,'on']]:[];if(n.type?.name==='Pick'){const options=nodes(n).filter(o=>o.type==='option'),value=o=>String(o.props.value??text(o));const selected=options.find(o=>value(o)===String(p.defaultValue))||options[0];return [[p.name,value(selected)]];}return [[p.name,String(p.value??p.defaultValue??'')]];}));
 h.submit=async(overrides={})=>{const values={...h.defaults(),...overrides},Original=globalThis.FormData;globalThis.FormData=class{constructor(form={}){this.values=form;}get(name){return this.values[name]??null;}set(name,value){this.values[name]=value;}};try{await h.form().props.onSubmit({preventDefault(){},currentTarget:values});}finally{globalThis.FormData=Original;h.render();}};
 h.remote=()=>structuredClone(remote);
 h.setDate=value=>{h.find(n=>n.props?.label==='Date'&&n.props.onChange).props.onChange({target:{value}});h.render();};
 h.render();const originalStorage=globalThis.localStorage;globalThis.localStorage={getItem:()=>null};try{await h.click('Retry');}finally{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
 h.setDate(selectedDay);return h;
}
