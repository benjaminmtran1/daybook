/** Optional local Node harness. No deployment or credentials are provisioned here. */
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {fromEnvironment} from './index.mjs';
const handler=fromEnvironment(process.env);
const server=createServer(async(req,res)=>{
 try{
  const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
  const init={method:req.method,headers};if(req.method!=='GET'&&req.method!=='HEAD'){init.body=Readable.toWeb(req);init.duplex='half';}
  // Internal URL is only for path dispatch, never a callback or return destination.
  const response=await handler(new Request('http://localhost'+req.url,init));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Calendar gateway unavailable."}');}
});
server.requestTimeout=20000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8788),process.env.CALENDAR_BIND_ADDRESS||'127.0.0.1');
