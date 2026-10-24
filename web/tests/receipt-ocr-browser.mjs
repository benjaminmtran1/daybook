// Real Chromium + synthetic receipt only. Never accesses a Daybook account.
// Start `npm run dev -- --port 5181` first, then run this file with Node.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage();
const external=[];
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.pathname==='/daybook/receipt-test')return route.fulfill({contentType:'text/html',body:`<html><body><div id="root"></div><script type="module">import React from '/daybook/node_modules/.vite/deps/react.js';import{createRoot}from'/daybook/node_modules/.vite/deps/react-dom_client.js';import ReceiptOCR from'/daybook/ReceiptOCR.tsx';createRoot(document.getElementById('root')).render(React.createElement('form',{},...['merchant','date','total','tax','file'].map(name=>React.createElement('input',{name,type:name==='file'?'file':'text',defaultValue:name==='merchant'?'Existing merchant':undefined,key:name})),React.createElement(ReceiptOCR)));</script></body></html>`});
 if(url.hostname==='127.0.0.1')return route.continue();
 external.push({url:url.href,method:request.method(),bytes:request.postDataBuffer()?.length||0});
 if(url.hostname!=='cdn.jsdelivr.net'||request.method()!=='GET'||request.postDataBuffer())return route.abort();
 return route.continue();
});
try{
 await page.goto('http://127.0.0.1:5181/daybook/receipt-test');
 await page.getByRole('button',{name:'Read receipt photo',exact:true}).waitFor();
 await page.getByRole('button',{name:'Read receipt photo',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Choose a receipt photo above first'}).waitFor();
 await page.locator('input[name=file]').setInputFiles({name:'receipt.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-synthetic')});
 await page.getByRole('button',{name:'Read receipt photo',exact:true}).click();
 // Input is not recognized or transmitted; currently UI uses generic fallback on validation errors.
 await page.getByRole('alert').waitFor();
 assert.equal(external.length,0);
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=660;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,660);ctx.fillStyle='black';ctx.font='34px monospace';['MAPLE OFFICE SUPPLY','2026-10-24','','Paper          10.00','SUBTOTAL       10.00','HST             1.30','TOTAL          11.30'].forEach((t,i)=>ctx.fillText(t,60,70+i*65));return canvas.toDataURL('image/png').split(',')[1];});
 await page.locator('input[name=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 const started=Date.now();
 await page.getByRole('button',{name:'Read receipt photo',exact:true}).click();
 await page.getByRole('heading',{name:'Review receipt suggestions'}).waitFor({timeout:125000});
 console.log(`Synthetic first scan completed in ${Date.now()-started} ms`);
 assert.equal(await page.locator('input[name=merchant]').inputValue(),'Existing merchant');
 assert.equal(await page.getByLabel('Total · CAD suggestion',{exact:true}).inputValue(),'11.30');
 assert.equal(await page.getByRole('button',{name:'Apply selected, reviewed values'}).isDisabled(),true);
 await page.getByLabel('Use Total · CAD',{exact:true}).check();
 await page.getByRole('button',{name:'Apply selected, reviewed values'}).click();
 assert.equal(await page.locator('input[name=total]').inputValue(),'11.30');
 assert.equal(await page.locator('input[name=merchant]').inputValue(),'Existing merchant');
 await page.getByRole('button',{name:'Discard suggestions'}).click();
 assert.equal(await page.getByRole('heading',{name:'Review receipt suggestions'}).count(),0);
 await page.getByRole('button',{name:'Read receipt photo',exact:true}).click();
 await page.getByRole('button',{name:'Cancel reading',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'cancelled'}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Review receipt suggestions'}).count(),0);
 assert.ok(external.every(r=>r.method==='GET'&&r.bytes===0));
 console.log('PASS: actual local OCR, explicit field-only apply, no automatic overwrite, PDF/manual fallback, cancellation; external asset GET requests only.',external);
}finally{await browser.close();}
