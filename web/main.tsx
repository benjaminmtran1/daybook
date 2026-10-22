import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Session} from '@supabase/supabase-js';
import {supabase} from './backend';
import Daybook from './Daybook';
import './edition.css';
import './auth.css';
const callbackParams=new URLSearchParams(location.hash.slice(1));
const callbackFailed=callbackParams.has('error')||new URLSearchParams(location.search).has('error');
const linkError='This email link is invalid or has expired. Request a new confirmation email below, then open the newest email only. If you were resetting your password, choose Forgot password instead.';
function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[mode,setMode]=useState(callbackFailed?'confirm':'signin'),[message,setMessage]=useState(callbackFailed?linkError:''),[busy,setBusy]=useState(false),[email,setEmail]=useState(''),[cooldown,setCooldown]=useState(0);
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(cooldown-1),1000);return()=>clearTimeout(timer);},[cooldown]);
 useEffect(()=>{
  supabase.auth.getSession().then(({data,error})=>{setSession(data.session);setReady(true);if(error&&!callbackFailed)setMessage(error.message);if(callbackFailed)history.replaceState(null,'',location.pathname);});
  const {data}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setMode('password');});
  return()=>data.subscription.unsubscribe();
 },[]);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||(mode==='confirm'&&cooldown))return;setBusy(true);setMessage('');
  const f=new FormData(e.currentTarget),password=String(f.get('password')||'');
  try{
   const redirect=location.origin+import.meta.env.BASE_URL;
   if(mode==='password'){const {error}=await supabase.auth.updateUser({password});if(error)throw error;setMode('signin');setMessage('Password updated.');}
   else if(mode==='signup'){const {error}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:redirect}});if(error)throw error;setMode('confirm');setCooldown(60);setMessage('Check your inbox to confirm your account. Open the newest confirmation email only; earlier links may no longer work.');}
   else if(mode==='confirm'){const {error}=await supabase.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:redirect}});if(error)throw error;setCooldown(60);setMessage('Confirmation email requested. Check your inbox and spam folder, then open the newest email only. You do not need to register again.');}
   else if(mode==='reset'){const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:redirect});if(error)throw error;setMessage('If an account exists, a reset link will arrive by email.');}
   else{const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;}
  }catch(e){const error=e as Error & {code?:string};if(error.code==='email_not_confirmed'){setMode('confirm');setMessage('Your email has not been confirmed yet. Request a fresh confirmation email below, then open the newest email only.');}else{setMessage(error.message);if(error.code==='over_email_send_rate_limit'||error.code==='over_request_rate_limit')setCooldown(60);}}
  finally{setBusy(false);}
 }
 function changeMode(next:string){setMode(next);setMessage('');}
 if(!ready)return <main className="auth-shell"><p>Opening Daybook…</p></main>;
 if(session&&mode!=='password')return <><Daybook key={session.user.id}/><button className="account-signout no-print" onClick={async()=>{if(!confirm('Sign out? Export any unsaved changes first.'))return;const {error}=await supabase.auth.signOut({scope:'local'});if(error)alert(error.message);}}>Sign out</button></>;
 return <main className="auth-shell">
  <p className="brand">daybook</p><p className="meta">Edition / Your private workspace</p>
  <h1>{mode==='signup'?'A fresh page.':mode==='confirm'?'Confirm your email.':mode==='reset'?'Reset your password.':mode==='password'?'Choose a new password.':'Make room for today.'}</h1>
  <p>{mode==='confirm'?'One more step to your private workspace.':'Projects, plans and paperwork. Together.'}</p>
  <form onSubmit={submit}>
   {mode!=='password'&&<label>Email<input name="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>}
   {mode!=='reset'&&mode!=='confirm'&&<label>Password<input key={mode} name="password" type="password" autoComplete={mode==='signin'?'current-password':'new-password'} minLength={mode==='signin'?1:12} required/></label>}
   <button className="primary" disabled={busy||(mode==='confirm'&&cooldown>0)}>{busy?'Please wait…':mode==='confirm'?(cooldown?`Resend available in ${cooldown}s`:'Resend confirmation email'):mode==='signup'?'Create account':mode==='reset'?'Send reset link':mode==='password'?'Save password':'Sign in'}</button>
  </form>
  <p role="status">{message}</p>
  {mode!=='password'&&<div className="row">
   <button disabled={busy} onClick={()=>changeMode(mode==='signin'?'signup':'signin')}>{mode==='signin'?'Create an account':'Back to sign in'}</button>
   {mode!=='confirm'&&<button disabled={busy} onClick={()=>changeMode('confirm')}>Resend confirmation email</button>}
   {mode!=='reset'&&<button disabled={busy} onClick={()=>changeMode('reset')}>Forgot password?</button>}
  </div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
