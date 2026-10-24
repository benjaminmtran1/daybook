import {useEffect,useRef,useState} from 'react';
import {createWorkspaceRefresh,type Snapshot} from './workspace-refresh';
import {daybookFetch} from './backend';
import {dataSchema,type Data} from './model';
export function useWorkspaceRefresh(options:{ownerId:string;enabled:boolean;version:number;apply:(snapshot:Snapshot<Data>)=>void}){
  const latest=useRef(options);
  latest.current=options;
  const [status,setStatus]=useState('');
  const coordinator=useRef<ReturnType<typeof createWorkspaceRefresh<Data>>|null>(null);
  useEffect(()=>{
    const sync=createWorkspaceRefresh<Data>({
      canRefresh:()=>latest.current.enabled&&document.visibilityState==='visible'&&navigator.onLine,
      version:()=>latest.current.version,
      read:async()=>{
        const response=await daybookFetch('/api/workspace',{cache:'no-store'},latest.current.ownerId);
        const body=await response.json();
        if(!response.ok)throw Error(body.error||'Could not refresh.');
        return {data:dataSchema.parse(body.data),version:body.version};
      },
      apply:snapshot=>latest.current.apply(snapshot),status:setStatus,
    });
    coordinator.current=sync;
    const refresh=()=>{void sync.refresh();};
    const timer=window.setInterval(refresh,30_000);
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    document.addEventListener('visibilitychange',refresh);
    return()=>{sync.dispose();coordinator.current=null;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  useEffect(()=>{
    coordinator.current?.invalidate();
    if(options.enabled)void coordinator.current?.refresh();
  },[options.enabled]);
  return {status,invalidate:()=>coordinator.current?.invalidate()};
}
