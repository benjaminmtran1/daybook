import {useEffect,useMemo} from 'react';
import {supabase} from './backend';
import {createCalendarClient} from './calendar-client';
import {allowedCalendarEndpoint,calendarTransport} from './calendar-transport';
export function calendarEnabled(){try{return !!import.meta.env.VITE_CALENDAR_GATEWAY_URL&&!!allowedCalendarEndpoint(import.meta.env.VITE_CALENDAR_GATEWAY_URL,window.location.origin);}catch{return false;}}
export function useCalendarClient(ownerId:string){
 const transport=useMemo(()=>calendarTransport(ownerId,allowedCalendarEndpoint(import.meta.env.VITE_CALENDAR_GATEWAY_URL,window.location.origin),{session:async()=>{const {data,error}=await supabase.auth.getSession();if(error)throw error;return data.session;},user:async token=>{const {data,error}=await supabase.auth.getUser(token);if(error)throw error;return data.user;}}),[ownerId]);
 const client=useMemo(()=>createCalendarClient(ownerId,transport.invoke,sessionStorage,localStorage),[ownerId,transport]);
 useEffect(()=>{transport.activate();return ()=>transport.dispose();},[transport]);return client;
}
