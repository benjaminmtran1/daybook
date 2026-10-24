import {validateCalendarDraft,validateSelection,type CalendarRef,type CalendarDraft} from '../../web/calendar-connections.ts';
import {createEventKey,stateHash} from './security.ts';
/** Deploying an HTTP wrapper is intentionally gated. These dependencies must be
 * server-owned: never trust an ownerId, selected flag or credential from a client. */
export type CreateDependencies={
 authenticate:(bearer:string)=>Promise<{id:string}>;
 selectedCalendar:(ownerId:string,connectionId:string,calendarId:string)=>Promise<CalendarRef|null>;
 // Atomically INSERT ... ON CONFLICT; the first caller owns this request.
 reserve:(key:string,payloadHash:string)=>Promise<'new'|'complete'|'pending'|'mismatch'|'cancelled'>;
 create:(ownerId:string,calendar:CalendarRef,eventId:string,draft:CalendarDraft)=>Promise<void>;
 finish:(key:string)=>Promise<void>;
};
export async function createSelectedEvent(deps:CreateDependencies,bearer:string,input:{connectionId:string;calendarId:string;requestId:string;draft:CalendarDraft}){
 const user=await deps.authenticate(bearer);
 if(!user.id)throw Error('Sign in to connect a calendar.');
 const calendar=await deps.selectedCalendar(user.id,input.connectionId,input.calendarId);
 if(!calendar||calendar.calendarId!==input.calendarId)throw Error('Select this calendar first.');
 validateSelection(calendar,input.connectionId,calendar.provider,true);
 const draft=validateCalendarDraft(input.draft);
 const key=await createEventKey(user.id,input.connectionId,input.calendarId,input.requestId);
 const hash=await stateHash(JSON.stringify(draft));
 const state=await deps.reserve(key,hash);
 if(state==='cancelled')throw Error('This creation was safely cancelled before it started. Start a new event request.');
 if(state==='mismatch')throw Error('This request was already used for a different event.');
 if(state==='complete')return {id:key,alreadyCreated:true};
 if(state==='pending')throw Error('Creation is pending verification. Do not create another copy.');
 // Failure (including lost response after a successful provider write) leaves the
 // reservation pending. Reconcile by GET the deterministic ID before any retry.
 await deps.create(user.id,calendar,key,draft);
 await deps.finish(key);
 return {id:key,alreadyCreated:false};
}
