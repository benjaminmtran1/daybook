/** A read-only refresh coordinator. Local edits always win over an in-flight read. */
export type Snapshot<T> = {data:T; version:number};
export function createWorkspaceRefresh<T>(options:{
  read:()=>Promise<Snapshot<T>>;
  timeoutMs?:number;
  canRefresh:()=>boolean;
  version:()=>number;
  apply:(snapshot:Snapshot<T>)=>void;
  status:(message:string)=>void;
}) {
  let epoch=0, running=false, disposed=false;
  const invalidate=()=>{epoch++;};
  async function refresh(){
    if(disposed||running||!options.canRefresh())return;
    const started=epoch, version=options.version();
    const current=()=>!disposed&&started===epoch&&options.canRefresh()&&options.version()===version;
    running=true;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
      const snapshot=await Promise.race([options.read(),new Promise<never>((_,reject)=>{
        timeout=setTimeout(()=>reject(Error('Workspace refresh timed out.')),options.timeoutMs??20_000);
      })]);
      if(!current())return;
      if(!Number.isSafeInteger(snapshot.version)||snapshot.version<0)throw Error('Invalid workspace revision.');
      if(snapshot.version>version){options.apply(snapshot);options.status('Updated from your other device.');}
      else options.status('');
    }catch{
      if(current())options.status('Could not check for changes. Your current workspace is still here; retrying when connected.');
    }finally{clearTimeout(timeout);running=false;}
  }
  return {refresh,invalidate,dispose(){disposed=true;invalidate();}};
}
