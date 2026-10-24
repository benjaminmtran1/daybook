// Local synthetic data only. All Supabase requests are intercepted before the network.
// Run the dev server first; CHROMIUM_PATH can point to an installed Chromium.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {emptyData,today} from '../model.ts';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext();
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'test-only'].join('.');
await context.addInitScript(({user,token})=>localStorage.setItem('sb-zbuiomquumyebfzdinvv-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic-local-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,token});
let data=emptyData(),version=1,reads=0,writes=0,uploads=0;
data.tasks.push({id:'task-1',title:'Synthetic focus task',projectId:'',deadline:'',day:today(),time:'',minutes:30,done:false,priority:false,repeat:'none'});
let releaseUpload;
const unexpected=[];
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname==='127.0.0.1')return route.continue();
 const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(url.hostname!=='zbuiomquumyebfzdinvv.supabase.co'){unexpected.push(url.href);return route.abort();}
 if(url.pathname==='/auth/v1/user')return json(user);
 if(url.pathname==='/rest/v1/daybook_workspaces'){reads++;return json({payload:data,version});}
 if(url.pathname==='/rest/v1/rpc/save_daybook'){
  writes++;const body=route.request().postDataJSON();
  if(body.expected_version!==version)return json({code:'40001',message:'stale'},409);
  data=body.document;return json(++version);
 }
 if(url.pathname.startsWith('/storage/v1/object/daybook-receipts/')){
  uploads++;await new Promise(resolve=>{releaseUpload=resolve;});return json({Key:'synthetic-receipt'});
 }
 unexpected.push(url.href);return route.abort();
});
try{
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/daybook/');
 await page.getByRole('button',{name:'Synthetic focus task',exact:true}).waitFor();
 await page.getByRole('button',{name:'Focus',exact:true}).click();
 await page.locator('dialog.task-focus').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Edit task',exact:true}).click();
 await page.locator('dialog:not(.task-focus) input[name="title"]').fill('Draft preserved');
 data=structuredClone(data);data.tasks[0].title='Remote task';version++;
 const before=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(100);
 assert.equal(reads,before,'No refresh while a form is open');
 assert.equal(await page.locator('input[name="title"]').inputValue(),'Draft preserved');
 await page.keyboard.press('Escape');
 await page.locator('dialog:not(.task-focus)').waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.querySelector('dialog.task-focus h1')?.textContent==='Remote task');
 await page.keyboard.press('Escape');await page.locator('dialog.task-focus').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 // Focus completion uses existing save path, remains visible, then restores usable page focus.
 await page.getByRole('button',{name:'Focus',exact:true}).click();
 await page.getByRole('button',{name:'Mark complete',exact:true}).click();
 await page.getByRole('button',{name:'Mark incomplete',exact:true}).waitFor();
 assert.equal(data.tasks[0].done,true);
 await page.getByRole('button',{name:'← Back',exact:true}).click();
 // Remote update is picked up on focus without resetting the chosen date.
 await page.getByLabel('Date',{exact:true}).fill('2026-11-01');
 data=structuredClone(data);data.tasks[0].done=false;data.tasks[0].day='2026-11-01';data.tasks[0].title='Second remote task';version++;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('button',{name:'Second remote task',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Date',{exact:true}).inputValue(),'2026-11-01');
 // A stale form save must preserve pending changes and block auto-refresh.
 await page.getByRole('button',{name:'Second remote task',exact:true}).click();
 await page.locator('input[name="title"]').fill('Pending local task');
 data=structuredClone(data);data.tasks[0].title='Newest remote task';version++;
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('heading',{name:'Save conflict'}).waitFor({state:'attached'});
 await page.keyboard.press('Escape');
 const conflictReads=reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(100);
 assert.equal(reads,conflictReads);assert.equal(data.tasks[0].title,'Newest remote task');
 assert.equal(await page.getByRole('button',{name:'Pending local task',exact:true}).count(),1);
 await page.screenshot({path:'/tmp/daybook-conflict.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('PASS: mocked browser focus/edit/Escape/completion, deferred refresh, chosen-date preservation, conflict preservation; no external requests.');
}finally{await browser.close();}
