import { useEffect, useRef, useState } from 'react';
import { defaultPushPreferences, type PushPreferences } from '../supabase/push-foundation/core';
import { disconnectDevicePush, enableDevicePush, pushAvailable, pushConfigured, pushStatus, savePushPreferences } from './push-client';
export default function PushReminders({ownerId,tasks}:{ownerId:string;tasks:readonly {id:string;title:string;done:boolean}[]}) {
  const [preferences,setPreferences]=useState<PushPreferences>({...defaultPushPreferences});
  const [connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [taskId,setTaskId]=useState(''),[at,setAt]=useState('');
  const running=useRef(false);
  const [loading,setLoading]=useState(pushConfigured);
  useEffect(()=>{let alive=true;if(pushConfigured){setLoading(true);pushStatus(ownerId).then(p=>{if(alive&&p){setPreferences(p);setConnected(true);}}).catch(e=>{if(alive)setMessage(e.message);}).finally(()=>{if(alive)setLoading(false);});}return()=>{alive=false;};},[ownerId]);
  async function run(action:()=>Promise<void|string|undefined>){if(running.current||loading)return;running.current=true;setBusy(true);setMessage('');try{const result=await action();if(result)setMessage(result);}catch(e){setMessage((e as Error).message);}finally{running.current=false;setBusy(false);}}
  function field<K extends keyof PushPreferences>(name:K,value:PushPreferences[K]){setPreferences(p=>({...p,[name]:value}));}
  return <section className="setting"><h2>Background notifications</h2>
    {!pushConfigured?<p>Not activated. The background notification service still needs approved setup and device testing. In-app planning prompts work separately while Daybook is visible.</p>:<>
      <p>Optional notifications on this device, including when Daybook is closed. Delivery depends on your device, connection and notification settings. Lock-screen text is generic and does not include task details.</p>
      {!pushAvailable()&&<p>Use a supported browser. On iPhone/iPad, add Daybook to the Home Screen and open its icon first.</p>}
      {loading&&<p role="status">Checking this device’s notification settings…</p>}<fieldset disabled={busy||loading}><legend>Notification schedule</legend><p>Changes take effect after Save notification settings or Enable notifications.</p>
        <label>Timezone<input value={preferences.timeZone} onChange={e=>field('timeZone',e.target.value)} placeholder="America/Toronto"/></label>
        {(['morning','evening','due'] as const).map(kind=><div key={kind}><label><input type="checkbox" checked={preferences[kind]!==null} onChange={e=>field(kind,e.target.checked?defaultPushPreferences[kind]:null)}/>{kind==='morning'?'Morning planning':kind==='evening'?'Evening review':'Tasks due today'}</label>{preferences[kind]!==null&&<input aria-label={`${kind} time`} type="time" value={preferences[kind]||''} onChange={e=>field(kind,e.target.value)}/>}</div>)}
        <label>Quiet hours start<input type="time" value={preferences.quietStart} onChange={e=>field('quietStart',e.target.value)}/></label>
        <label>Quiet hours end<input type="time" value={preferences.quietEnd} onChange={e=>field('quietEnd',e.target.value)}/></label>
        <p>Quiet-hour reminders are skipped, not delayed. Equal start/end means no quiet hours. Missed reminders older than 15 minutes are not replayed.</p>
        <label>Task alert<select value={taskId} onChange={e=>setTaskId(e.target.value)}><option value="">Choose a task</option>{tasks.filter(t=>!t.done).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
        <label>Alert date and time (this device’s local timezone)<input type="datetime-local" value={at} onChange={e=>setAt(e.target.value)}/></label>
        <button type="button" disabled={!taskId||!at} onClick={()=>{const date=new Date(at);if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()){setMessage('Choose a valid future time.');return;}field('taskAlerts',[...preferences.taskAlerts.filter(a=>a.taskId!==taskId),{taskId,at:date.toISOString()}]);setAt('');}}>Add or replace task alert</button>
        <ul>{preferences.taskAlerts.map(a=><li key={a.taskId}>{tasks.find(t=>t.id===a.taskId)?.title||'Unavailable task'} · {new Date(a.at).toLocaleString()} <button type="button" onClick={()=>field('taskAlerts',preferences.taskAlerts.filter(other=>other.taskId!==a.taskId))}>Remove</button></li>)}</ul>
        {connected?<><button type="button" onClick={()=>run(async()=>{await savePushPreferences(ownerId,preferences);setMessage('Notification settings saved.');})}>Save notification settings</button><button type="button" onClick={()=>run(async()=>{const result=await disconnectDevicePush(ownerId);setConnected(false);setPreferences(p=>({...p,enabled:false}));return result||'Notifications disabled on this device.';})}>Disable on this device</button></>:<><button type="button" disabled={!pushAvailable()} onClick={()=>run(async()=>{await enableDevicePush(ownerId,preferences);setConnected(true);setPreferences(p=>({...p,enabled:true}));setMessage('Device subscribed. Live delivery still depends on the configured sender and OS settings.');})}>Enable notifications on this device</button><button type="button" onClick={()=>run(async()=>{const result=await disconnectDevicePush(ownerId);return result||'Device subscription cleared.';})}>Clear previous device subscription</button></>}
      </fieldset>
    </>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
