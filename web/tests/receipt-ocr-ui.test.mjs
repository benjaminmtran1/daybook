import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseReceipt} from '../receipt-ocr.ts';
const source=await readFile(new URL('../ReceiptOCR.tsx',import.meta.url),'utf8');
const mock='data:text/javascript,'+encodeURIComponent(`export const useRef=()=>globalThis.__receiptHarness.refs[globalThis.__receiptHarness.refIndex++];export const useState=initial=>{const h=globalThis.__receiptHarness,i=h.index++;if(!(i in h.states))h.states[i]=initial;return[h.states[i],value=>h.states[i]=value]};export const useEffect=fn=>globalThis.__receiptHarness.effects.push(fn);`);
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/import ['"]\.\/receipt-ocr.css['"];?/,'').replace(/from ['"]react['"]/,`from '${mock}'`).replace(/from ['"]react\/jsx-runtime['"]/,`from '${import.meta.resolve('react/jsx-runtime')}'`).replace(/from ['"]\.\/receipt-ocr['"]/,`from '${new URL('../receipt-ocr.ts',import.meta.url).href}'`);
const dir=await mkdtemp(join(tmpdir(),'receipt-ui-'));let ReceiptOCR;
try{await writeFile(join(dir,'ReceiptOCR.mjs'),compiled);ReceiptOCR=(await import(pathToFileURL(join(dir,'ReceiptOCR.mjs')).href)).default;}finally{await rm(dir,{recursive:true,force:true});}
function nodes(tree){return tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)]:[];}
function setup(selected=['total']){
 const controls=Object.fromEntries(['merchant','date','total','tax'].map(name=>[name,new FakeInput(name==='merchant'?'Original':name==='tax'?'0':'')]));
 const listeners={};const form={elements:{namedItem:name=>controls[name]},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:()=>{}};
 const reading=parseReceipt('SYNTHETIC SHOP\n2026-10-24\nTOTAL 11.30\nTAX 1.30',95);
 const h={index:0,refIndex:0,states:[false,'','',reading,{...reading.suggestions},selected],refs:[{current:{closest:()=>form}},{current:null},{current:Object.fromEntries(Object.entries(controls).map(([name,input])=>[name,input.value]))}],effects:[]};globalThis.__receiptHarness=h;
 return {h,controls,listeners,render(){h.index=0;h.refIndex=0;return ReceiptOCR();}};
}
class FakeInput{constructor(value){this._value=value;this.events=[];}get value(){return this._value;}set value(value){this._value=value;}dispatchEvent(event){this.events.push(event.type);}}
globalThis.HTMLInputElement=FakeInput;
test('review never preselects fields; apply is explicitly disabled',()=>{const h=setup([]);const tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='button'&&n.props.children==='Apply selected, reviewed values').props.disabled,true);assert.equal(h.controls.merchant.value,'Original');});
test('applies only explicitly checked fields; repeat click cannot apply again',()=>{const h=setup();let tree=h.render();nodes(tree).find(n=>n.type==='button'&&n.props.children==='Apply selected, reviewed values').props.onClick();assert.equal(h.controls.total.value,'11.30');assert.equal(h.controls.merchant.value,'Original');assert.deepEqual(h.controls.total.events,['input','change']);tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='button'&&n.props.children==='Apply selected, reviewed values').props.disabled,true);});
test('file replacement clears old suggestions and cancels previous read',()=>{const h=setup();h.render();let aborted=0;h.h.refs[1].current={abort:()=>aborted++};h.h.effects[0]();h.listeners.change({target:{name:'file'}});assert.equal(aborted,1);assert.equal(h.h.refs[1].current,null);assert.equal(h.h.states[3],null);assert.deepEqual(h.h.states[5],[]);});
test('closing form aborts and invalidates pending results',()=>{const h=setup();h.render();let aborted=0;h.h.refs[1].current={abort:()=>aborted++};h.h.effects[0]()();assert.equal(aborted,1);assert.equal(h.h.refs[1].current,null);});
test('invalid selected amounts do not mutate any field',()=>{const h=setup();h.h.states[4].total='-1';const tree=h.render();nodes(tree).find(n=>n.type==='button'&&n.props.children==='Apply selected, reviewed values').props.onClick();assert.equal(h.controls.total.value,'');assert.match(h.h.states[2],/Correct/);});

test('edits made after scan began are never overwritten',()=>{const h=setup();h.controls.total.value='20.00';const tree=h.render();nodes(tree).find(n=>n.type==='button'&&n.props.children==='Apply selected, reviewed values').props.onClick();assert.equal(h.controls.total.value,'20.00');assert.match(h.h.states[2],/changed since this scan/);});
