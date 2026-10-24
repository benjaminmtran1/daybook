import { supabase } from './backend';
import { registerDaybookWorker } from './pwa';
import { validatePreferences, type PushPreferences } from '../supabase/push-foundation/core';
const publicKey = import.meta.env.VITE_DAYBOOK_VAPID_PUBLIC_KEY || '';
export const pushConfigured = import.meta.env.VITE_DAYBOOK_PUSH_ENABLED === 'true' && /^[A-Za-z0-9_-]{87}=?$/.test(publicKey);
const marker = 'daybook-push-owner-v1';
async function bounded<T>(promise:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Reminder service timed out.')),10000);})]);}finally{if(timer)clearTimeout(timer);}}
export function pushAvailable() { return typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window; }
function decodeKey(key: string) { const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
async function api(ownerId: string, body: Record<string, unknown>) {
  if(!pushConfigured)throw Error('Background reminders are not activated.');
  const {data:{session},error}=await bounded(supabase.auth.getSession());
  if(error||!session||session.user.id!==ownerId)throw Error('Your account changed. Sign in again.');
  const token=session.access_token;
  const verified=await bounded(supabase.auth.getUser(token));
  if(verified.error||verified.data.user?.id!==ownerId)throw Error('Your session expired.');
  const result=await supabase.functions.invoke('daybook-push',{body,headers:{Authorization:`Bearer ${token}`},timeout:10000});
  if(result.error||result.data?.error)throw Error(result.data?.error||'Background reminders could not be updated.');
  // Do not apply an old account response after account switching.
  const current=await bounded(supabase.auth.getSession());
  if(current.data.session?.user.id!==ownerId)throw Error('Your account changed. Reload reminder settings.');
  return result.data;
}
async function registration() {
  const result=await registerDaybookWorker();
  if(!result)throw Error('This browser cannot register background reminders.');
  if(result.active)return result;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {return await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The app worker is not ready. Reload Daybook and try again.')),10000);})]);}
  finally{if(timer)clearTimeout(timer);}
}
async function existingSubscription() {
  if(!pushAvailable())return null;
  const base=new URL(import.meta.env.BASE_URL,location.href);
  const reg=await navigator.serviceWorker.getRegistration(base.href);
  return reg ? reg.pushManager.getSubscription() : null;
}
export async function pushStatus(ownerId: string):Promise<PushPreferences|null> {
  if(!pushConfigured||!pushAvailable())return null;
  const subscription=await existingSubscription();
  if(!subscription)return null;
  const previous=localStorage.getItem(marker);
  if(previous&&previous!==ownerId)throw Error('This browser has another account’s subscription. Use Disable on this device before enabling yours.');
  const result=await api(ownerId,{action:'status',endpoint:subscription.endpoint});
  return result.subscription ? validatePreferences(result.subscription.preferences) : null;
}
/** Call ONLY directly from the explicit Enable button click, never from an effect. */
export async function enableDevicePush(ownerId: string, preferences: PushPreferences) {
  if(!pushConfigured||!pushAvailable())throw Error('Install Daybook as a Home Screen app on supported iPhone/iPad, or use a supported browser.');
  const validated=validatePreferences({...preferences,enabled:true});
  // Reading the marker before requesting permission makes account conflicts fail without a prompt.
  const previous=localStorage.getItem(marker);
  if(previous&&previous!==ownerId)throw Error('Disable the previous account’s device subscription first.');
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')throw Error('Notifications were not allowed. You can change this in browser or device settings.');
  const reg=await registration();
  let subscription=await reg.pushManager.getSubscription();
  const created=!subscription;
  if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)});
  try {
    await api(ownerId,{action:'subscribe',subscription:subscription.toJSON(),preferences:validated});
    localStorage.setItem(marker,ownerId);
  } catch(error) {
    // A failed/uncertain API response must not leave a newly-created active device subscription.
    // Backend stale rows are harmless once provider invalidates endpoint; dispatcher prunes 410.
    if(created)await subscription.unsubscribe().catch(()=>false);
    throw error;
  }
}
export async function savePushPreferences(ownerId:string,preferences:PushPreferences){
  const subscription=await existingSubscription();if(!subscription)throw Error('Enable notifications on this device first.');
  await api(ownerId,{action:'preferences',endpoint:subscription.endpoint,preferences:validatePreferences(preferences)});
}
/** Used by explicit Disable and before sign-out. Browser unsubscribes even if server deletion fails. */
export async function disconnectDevicePush(ownerId:string) {
  const subscription=await bounded(existingSubscription());
  if(!subscription){localStorage.removeItem(marker);return;}
  // Disable delivery locally first; never wait for the network before stopping this device.
  const unsubscribed=await bounded(subscription.unsubscribe()).catch(()=>false);
  let serverError:unknown;
  if(pushConfigured){try{await api(ownerId,{action:'unsubscribe',endpoint:subscription.endpoint});}catch(error){serverError=error;}}
  if(!unsubscribed)throw Error('Could not disable notifications on this device. Turn them off in browser settings before switching accounts.');
  localStorage.removeItem(marker);
  // Device is now disabled. A failed server delete cannot deliver to the unsubscribed endpoint.
  return serverError ? 'Disabled on this device. Server cleanup could not be confirmed; expired subscriptions are removed by the sender.' : undefined;
}
