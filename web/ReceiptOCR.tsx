import {useEffect,useRef,useState} from 'react';
import {readReceiptImage,type ReceiptField,type ReceiptReading,type ReceiptSuggestions,validateReceiptImage} from './receipt-ocr';
import './receipt-ocr.css';
const labels:Record<ReceiptField,string>={merchant:'Merchant',date:'Date',total:'Total · CAD',tax:'Included tax · CAD'};
const fields=Object.keys(labels) as ReceiptField[];

/** Place inside the expense form alongside its file input and named expense fields. */
export default function ReceiptOCR(){
  const root=useRef<HTMLDivElement>(null), controller=useRef<AbortController|null>(null), scanValues=useRef<ReceiptSuggestions>({});
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [reading,setReading]=useState<ReceiptReading|null>(null),[draft,setDraft]=useState<ReceiptSuggestions>({}),[selected,setSelected]=useState<ReceiptField[]>([]);
  useEffect(()=>{
    const form=root.current?.closest('form');
    const changed=(event:Event)=>{if((event.target as HTMLInputElement).name==='file'){controller.current?.abort();controller.current=null;setBusy(false);setReading(null);setSelected([]);setStatus('');setError('');}};
    form?.addEventListener('change',changed);
    return ()=>{controller.current?.abort();controller.current=null;form?.removeEventListener('change',changed);};
  },[]);
  async function scan(){
    if(controller.current)return;
    const form=root.current?.closest('form'),input=form?.elements.namedItem('file') as HTMLInputElement|null;
    const file=input?.files?.[0];if(!file){setError('Choose a receipt photo above first.');return;}
    try{validateReceiptImage(file);}catch(e){setError((e as Error).message);return;}
    scanValues.current=Object.fromEntries(fields.map(name=>[name,(form?.elements.namedItem(name) as HTMLInputElement|null)?.value??'']));
    const active=new AbortController();controller.current=active;
    setBusy(true);setError('');setReading(null);setSelected([]);setStatus('Preparing private receipt reader…');
    const timeout=setTimeout(()=>active.abort(),120000);
    try {
      const result=await readReceiptImage(file,active.signal,async progress=>{
        const {createWorker}=await import('tesseract.js');
        return createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',logger:message=>progress(message.status,message.progress),errorHandler:()=>{}});
      },(stage,value)=>{if(controller.current===active)setStatus(`${stage} ${Math.round((value||0)*100)}%`);});
      if(controller.current!==active)return;
      setReading(result);setDraft({...result.suggestions});setStatus('Review the suggestions below. Nothing has been changed.');
    }catch(e){if(controller.current===active){setError((e as Error).name==='AbortError'?'Reading cancelled or timed out. You can retry or enter the details manually.':'Could not read this photo. Try a clearer image, check your connection for the reader download, or enter details manually.');setStatus('');}}
    finally{clearTimeout(timeout);if(controller.current===active){controller.current=null;setBusy(false);}}
  }
  function apply(){
    const form=root.current?.closest('form');if(!form)return;
    const checked=selected.map(name=>({name,input:form.elements.namedItem(name) as HTMLInputElement|null,value:draft[name]??''}));
    if(checked.some(({name,input})=>input&&input.value!==scanValues.current[name])){setError('A selected field changed since this scan started. Your edits were kept. Deselect that field or scan again before applying.');return;}
    for(const {name,value} of checked){if(!value.trim() || ((name==='total'||name==='tax')&&(!/^\d+(?:\.\d{1,2})?$/.test(value)||+value>1000000)) || (name==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(value))){setError('Correct the selected suggestions before applying.');return;}}
    const nextTotal=selected.includes('total')?draft.total:(form.elements.namedItem('total') as HTMLInputElement)?.value;
    const nextTax=selected.includes('tax')?draft.tax:(form.elements.namedItem('tax') as HTMLInputElement)?.value;
    if(nextTotal && nextTax && +nextTax>+nextTotal){setError('Included tax cannot exceed the total. Correct the suggestions or form first.');return;}
    for(const {name,input,value} of checked){if(input){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));scanValues.current[name]=value;}}
    setSelected([]);setError('');setStatus('Selected values applied to the form. Check them once more, then save the expense.');
  }
  return <div className="receipt-ocr" ref={root}>
    <p>Read a receipt photo privately on this device. The first scan downloads the English OCR engine and model from public CDNs; the photo is not sent to an OCR service. Saving the expense still uploads its attachment to your private Daybook account.</p>
    <p>JPEG, PNG and WebP only. PDFs and HEIC are not read automatically; use manual entry or convert a photo to a supported format. Clear, upright English receipts work best; first scans may take a minute.</p>
    <button type="button" onClick={scan} disabled={busy}>{busy?'Reading photo…':'Read receipt photo'}</button>
    {busy&&<button type="button" onClick={()=>controller.current?.abort()}>Cancel reading</button>}
    {status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
    {reading&&<div className="receipt-ocr-review"><h3>Review receipt suggestions</h3><p>Text confidence: {Math.round(reading.confidence)}%. This is not field accuracy. Select only the values you have checked. Applying replaces those fields, including anything already entered.</p>
      <ul>{reading.warnings.map(w=><li key={w}>{w}</li>)}</ul>
      {fields.filter(name=>reading.suggestions[name]!==undefined).map(name=><div className="receipt-ocr-field" key={name}>
        <label><input type="checkbox" checked={selected.includes(name)} onChange={e=>setSelected(e.target.checked?[...selected,name]:selected.filter(n=>n!==name))}/> Use {labels[name]}</label>
        <input aria-label={`${labels[name]} suggestion`} type={name==='date'?'date':name==='merchant'?'text':'number'} min={name==='total'||name==='tax'?'0':undefined} step={name==='total'||name==='tax'?'0.01':undefined} value={draft[name]??''} onChange={e=>setDraft({...draft,[name]:e.target.value})}/>
      </div>)}
      {!Object.keys(reading.suggestions).length&&<p>No reliable fields found. Enter the details manually.</p>}
      <button type="button" disabled={!selected.length} onClick={apply}>Apply selected, reviewed values</button>
      <button type="button" onClick={()=>{setReading(null);setSelected([]);setStatus('Suggestions discarded. Values already applied remain in the form.');}}>Discard suggestions</button>
      <details><summary>Extracted text (may contain mistakes)</summary><pre>{reading.text}</pre></details>
    </div>}
  </div>;
}
