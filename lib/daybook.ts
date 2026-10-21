import { z } from 'zod';
const id=z.string().max(100), str=z.string().max(20000), day=z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/), amount=z.number().finite().min(0).max(100000000);
export const clientSchema=z.object({id,name:z.string().trim().min(1).max(200),email:z.string().max(300),address:str,terms:str});
export const projectSchema=z.object({id,name:z.string().trim().min(1).max(200),clientId:id,space:z.enum(['Work','Personal']),deadline:day,archived:z.boolean()});
export const taskSchema=z.object({id,title:z.string().trim().min(1).max(500),projectId:id,deadline:day,day:day,time:z.string().regex(/^$|^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/),minutes:z.number().int().min(15).max(1440).multipleOf(15),done:z.boolean(),priority:z.boolean(),repeat:z.enum(['none','daily','weekly','monthly'])});
export const noteSchema=z.object({id,projectId:id,title:z.string().trim().min(1).max(200),body:str});
export const expenseSchema=z.object({id,projectId:id,merchant:z.string().trim().min(1).max(300),date:day,total:amount,tax:amount,fileId:z.string().max(100),fileName:z.string().max(300),submitted:z.boolean(),invoiceId:id});
export const eventSchema=z.object({id,title:z.string().trim().min(1).max(300),day,time:z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/),minutes:z.number().int().min(15).max(1440).multipleOf(15),space:z.enum(['Work','Personal'])});
export const sellerSchema=z.object({name:z.string().max(300),email:z.string().max(300),address:str,taxId:z.string().max(200),payment:str});
export const invoiceSchema=z.object({id,projectId:id,projectName:str,number:z.string().min(1).max(100),date:day,due:day,client:clientSchema,seller:sellerSchema,items:z.array(z.object({description:z.string().min(1).max(500),qty:z.number().positive().max(100000),rate:amount})).min(1).max(200),expenseIds:z.array(id),expenses:z.array(z.object({merchant:str,total:amount})),taxRate:z.number().min(0).max(100),terms:str,status:z.enum(['draft','sent','paid'])});
export const dataSchema=z.object({clients:z.array(clientSchema).max(2000),projects:z.array(projectSchema).max(2000),tasks:z.array(taskSchema).max(10000),notes:z.array(noteSchema).max(5000),expenses:z.array(expenseSchema).max(10000),events:z.array(eventSchema).max(5000),invoices:z.array(invoiceSchema).max(5000),seller:sellerSchema});
export type Data=z.infer<typeof dataSchema>;
export type Task=z.infer<typeof taskSchema>;
export type Invoice=z.infer<typeof invoiceSchema>;
export const emptyData=():Data=>({clients:[],projects:[],tasks:[],notes:[],expenses:[],events:[],invoices:[],seller:{name:'',email:'',address:'',taxId:'',payment:''}});
export const uid=()=>crypto.randomUUID();
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
export const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const money=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
export function invoiceTotals(i:Pick<Invoice,'items'|'taxRate'|'expenses'>){const subtotal=i.items.reduce((a,x)=>a+Math.round(x.qty*x.rate*100),0),tax=Math.round(subtotal*i.taxRate/100),expenses=i.expenses.reduce((a,x)=>a+Math.round(x.total*100),0);return {subtotal:subtotal/100,tax:tax/100,expenses:expenses/100,total:(subtotal+tax+expenses)/100};}
export function conflict(d:Data,t:{id:string;day:string;time:string;minutes:number}){if(!t.time)return '';const start=minute(t.time),end=start+t.minutes;if(end>1440)return 'This block extends past midnight.';return [...d.tasks.filter(x=>!x.done),...d.events].some(x=>x.id!==t.id&&x.day===t.day&&x.time&&start<minute(x.time)+x.minutes&&end>minute(x.time))?'This block overlaps a scheduled task or event.':'';}
export function rollForward(d:Data,date:string):Data{return {...d,tasks:d.tasks.map(t=>!t.done&&t.day&&t.day<date?{...t,day:date,time:''}:t)};}
export function nextDay(date:string,repeat:string){const d=new Date(date+'T12:00:00Z');if(repeat==='monthly'){const n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,last));}else d.setUTCDate(d.getUTCDate()+(repeat==='weekly'?7:1));return d.toISOString().slice(0,10);}
// Deterministic arithmetic parser. Never execute note content.
export function calculations(body:string){const vars:Record<string,number>={},out:{line:string,value:string}[]=[];
function evaluate(s:string){const ts=s.replace(/×/g,'*').replace(/÷/g,'/').replace(/\$/g,'').match(/\d*\.\d+|\d+|[A-Za-z_]+|[^\s]/g)||[];let pos=0;
function atom():number{const v=ts[pos++];if(v==='-')return -atom();if(v==='+')return atom();if(v==='('){const n=expression();if(ts[pos++]!==')')throw Error();return n;}if(/^\d*\.?\d+$/.test(v||''))return Number(v);if(Object.hasOwn(vars,v))return vars[v];throw Error();}
function product(){let n=atom();while(['*','/'].includes(ts[pos])){const op=ts[pos++],v=atom();n=op==='*'?n*v:n/v;}return n;}
function expression(){let n=product();while(['+','-'].includes(ts[pos])){const op=ts[pos++],v=product();n=op==='+'?n+v:n-v;}return n;}
const n=expression();if(pos!==ts.length||!Number.isFinite(n))throw Error();return n;}
const costs:number[]=[];for(const line of body.split('\n')){const assignment=line.match(/^([A-Za-z_]+)\s*=\s*(.+)$/),convert=line.match(/^(.+?)\s+(in|mm|cm|ft|m)\s+to\s+(in|mm|cm|ft|m)$/),sum=/^sum\s*$/i.test(line),cost=line.match(/^\$([\d.]+)$/),expr=/^[\d\s().+*/×÷-]+\s*=\s*$/.test(line);try{let n:number|undefined,unit='';if(cost){costs.push(Number(cost[1]));continue;}if(assignment){n=evaluate(assignment[2]);vars[assignment[1]]=n;}else if(convert){const u:Record<string,number>={in:25.4,mm:1,cm:10,ft:304.8,m:1000};n=evaluate(convert[1])*u[convert[2]]/u[convert[3]];unit=' '+convert[3];}else if(sum)n=costs.reduce((a,n)=>a+n,0);else if(expr)n=evaluate(line.replace(/=\s*$/,''));if(n!==undefined)out.push({line,value:n.toLocaleString('en-CA',{maximumFractionDigits:3})+unit});}catch{out.push({line,value:'Check expression'});}}return out;}
