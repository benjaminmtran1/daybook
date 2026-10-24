import React,{useState} from 'react';
import {LiveCalendarSettings} from './LiveCalendarConnections';
import {calendarEnabled} from './useCalendarClient';
import {calendarProviders} from './calendar-connections';
/** No connect action is exposed before the secure backend and consent flow are deployed. */
export default function CalendarConnections({ownerId}:{ownerId?:string}){
 const [expanded,setExpanded]=useState(false);
 if(ownerId&&calendarEnabled())return <LiveCalendarSettings ownerId={ownerId}/>;
 return <section className="setting" aria-labelledby="calendar-connections-title"><h2 id="calendar-connections-title">Connected calendars</h2><p>Google Calendar and iCloud Calendar are planned for live access. Neither is connected in this build.</p>{calendarProviders.map(provider=><div key={provider.id}><div className="report-row"><strong>{provider.name}</strong><span>Secure setup required</span></div><p className="meta">{provider.description}</p></div>)}<button type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide connection details':'What needs setup?'}</button>{expanded&&<div><p>Live access needs an approved server deployment and a separate secure authorization for each provider. Do not enter an Apple password or calendar token into Daybook notes or chat.</p><p>Once enabled, you will choose which calendars appear and explicitly choose where to create an event. Existing events will open in their original calendar for editing. No automatic copying, editing, or deleting of external events.</p><p>Calendar file export remains available now. It is a one-time export, not live synchronization.</p></div>}</section>;
}
