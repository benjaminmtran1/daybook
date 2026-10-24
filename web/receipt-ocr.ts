/** Conservative suggestions only: these values must never be saved without review. */
export type ReceiptField = 'merchant' | 'date' | 'total' | 'tax';
export type ReceiptSuggestions = Partial<Record<ReceiptField, string>>;
export type ReceiptReading = {text:string; confidence:number; suggestions:ReceiptSuggestions; warnings:string[]};

function validDate(year:number, month:number, day:number) {
  const date = new Date(Date.UTC(year,month-1,day));
  return year>=2000 && year<=2100 && date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day
    ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : undefined;
}
function moneyAtEnd(line:string) {
  const match=line.match(/(?:^|\s|\$)(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*(?:CAD)?\s*$/i);
  if(!match) return undefined;
  const value=Number(match[1].replaceAll(',',''));
  return Number.isFinite(value) && value<=1000000 ? value.toFixed(2) : undefined;
}
export function parseReceipt(text:string, confidence=0):ReceiptReading {
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const suggestions:ReceiptSuggestions={},warnings:string[]=[];
  const merchant=lines.slice(0,4).find(l=>/[a-z]{3}/i.test(l) && !/\b(receipt|invoice|tax|date|tel|phone|www|http|total)\b|@|\d{4}/i.test(l));
  if(merchant) suggestions.merchant=merchant.slice(0,160);
  const dates=new Set<string>();
  for(const line of lines) {
    for(const m of line.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {const d=validDate(+m[1],+m[2],+m[3]);if(d)dates.add(d);}
    for(const m of line.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/g)) {
      const a=+m[1],b=+m[2];
      if(a<=12 && b<=12 && a!==b) {warnings.push('Ambiguous date order. Enter the receipt date manually.');continue;}
      const d=a>12?validDate(+m[3],b,a):validDate(+m[3],a,b);if(d)dates.add(d);
    }
  }
  if(dates.size===1)suggestions.date=[...dates][0];
  else if(dates.size>1)warnings.push('Multiple dates found. Enter the correct date manually.');
  const totals=new Set(lines.filter(l=>/^(?:grand\s+total|total(?:\s+(?:due|amount))?|amount\s+due|balance\s+due)\b/i.test(l)).map(moneyAtEnd).filter((v):v is string=>!!v));
  if(totals.size===1)suggestions.total=[...totals][0];
  else if(totals.size>1)warnings.push('Conflicting totals found. Enter the total manually.');
  const taxes=lines.filter(l=>/^(?:(?:included|sales|total)\s+)?(?:tax|hst|gst|pst|qst)\b/i.test(l)).map(moneyAtEnd).filter((v):v is string=>!!v);
  if(taxes.length===1)suggestions.tax=taxes[0];
  else if(taxes.length>1)warnings.push('Multiple tax lines found. Review and enter the combined included tax manually.');
  if(suggestions.tax && suggestions.total && +suggestions.tax>+suggestions.total) {delete suggestions.tax;warnings.push('Detected tax exceeds total and was discarded.');}
  if(confidence<75)warnings.push('Low text confidence. Check every suggestion carefully against the receipt.');
  warnings.push('Merchant and amounts are guesses, not verified accounting data. CAD is assumed; check the receipt currency.');
  return {text,confidence,suggestions,warnings:[...new Set(warnings)]};
}
export function validateReceiptImage(file:Pick<File,'type'|'size'>) {
  if(file.type==='application/pdf')throw Error('PDF reading is not supported. Keep the PDF attached and enter its details manually, or choose a JPEG, PNG or WebP photo.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP receipt photo.');
  if(!file.size || file.size>10*1024*1024)throw Error('Choose a receipt photo smaller than 10 MB.');
}
export interface ReceiptWorker {recognize:(image:Blob)=>Promise<{data:{text:string;confidence:number}}>;terminate:()=>Promise<unknown>}
export type ReceiptWorkerFactory=(progress:(status:string,progress:number)=>void)=>Promise<ReceiptWorker>;
export async function readReceiptImage(file:File, signal:AbortSignal, factory:ReceiptWorkerFactory, progress:(status:string,progress:number)=>void):Promise<ReceiptReading> {
  validateReceiptImage(file);
  if(signal.aborted)throw new DOMException('Receipt reading cancelled.','AbortError');
  let worker:ReceiptWorker|undefined, terminated=false;
  const terminate=()=>{if(worker&&!terminated){terminated=true;void worker.terminate().catch(()=>{});}};
  let abort:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>{terminate();reject(new DOMException('Receipt reading cancelled.','AbortError'));};signal.addEventListener('abort',abort,{once:true});});
  const work=(async()=>{
    worker=await factory((status,value)=>{if(!signal.aborted)progress(status,value);});
    if(signal.aborted){terminate();throw new DOMException('Receipt reading cancelled.','AbortError');}
    const {data}=await worker.recognize(file);
    if(signal.aborted)throw new DOMException('Receipt reading cancelled.','AbortError');
    return parseReceipt(data.text,data.confidence);
  })();
  try {return await Promise.race([work,cancelled]);}
  finally {signal.removeEventListener('abort',abort);terminate();}
}
