// Opt-in actual engine benchmark, synthetic fixture only. No Daybook login required.
// Optional OCR_LANG_PATH points to local eng.traineddata, avoiding a model download.
import {createWorker} from 'tesseract.js';
import assert from 'node:assert/strict';
import {parseReceipt} from '../receipt-ocr.ts';
import {fileURLToPath} from 'node:url';
const start=performance.now();
const worker=await createWorker('eng',1,{langPath:process.env.OCR_LANG_PATH||'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',gzip:!process.env.OCR_LANG_PATH,cacheMethod:'none'});
try{
 const {data}=await worker.recognize(fileURLToPath(new URL('./fixtures/synthetic-receipt.png',import.meta.url)));
 const result=parseReceipt(data.text,data.confidence);
 assert.deepEqual(result.suggestions,{merchant:'MAPLE OFFICE SUPPLY',date:'2026-10-24',total:'11.30',tax:'1.30'});
 console.log(JSON.stringify({elapsedMs:Math.round(performance.now()-start),confidence:data.confidence,suggestions:result.suggestions,model:process.env.OCR_LANG_PATH||'pinned public English model'}));
}finally{await worker.terminate();}
