/** Keep spreadsheet applications from interpreting imported text as a formula. */
export function csvText(value:string){
 const literal=/^[\t\r\n]|^\s*[=+\-@]/.test(value)?"'"+value:value;
 return '"'+literal.replaceAll('"','""')+'"';
}
/** RFC 5545 text escaping, including bare CR from pasted/imported content. */
export function icalText(value:string){return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[,;]/g,'\\$&');}
/** Fold UTF-8 content lines at 75 octets without splitting a Unicode code point. */
export function foldCalendar(value:string){
 const encoder=new TextEncoder();
 return value.split('\r\n').map(line=>{
  let out='',bytes=0;
  for(const char of line){const size=encoder.encode(char).length;if(bytes+size>75){out+='\r\n ';bytes=1;}out+=char;bytes+=size;}
  return out;
 }).join('\r\n');
}
