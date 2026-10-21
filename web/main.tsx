import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Session} from '@supabase/supabase-js';
import {supabase} from './backend';
import Daybook from './Daybook';
import './edition.css';
import './auth.css';
function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[mode,setMode]=useState('signin'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{supabase.auth.getSession().then(({data,error})=>{setSession(data.session);setReady(true);if(error)setMessage(error.message);});const {data}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setMode('password');});return()=>data.subscription.unsubscribe();},[]);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget),email=String(f.get('email')||''),password=String(f.get('password')||'');try{
  const redirect=location.origin+import.meta.env.BASE_URL;
  if(mode==='password'){const {error}=await supabase.auth.updateUser({password});if(error)throw error;setMode('signin');setMessage('Password updated.');}
  else if(mode==='signup'){const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:redirect}});if(error)throw error;setMessage('Check your email to confirm your account, then sign in.');}
  else if(mode==='reset'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirect});if(error)throw error;setMessage('If an account exists, a reset link will arrive by email.');}
  else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 if(!ready)return <main className="auth-shell"><p>Opening Daybook…</p></main>;
 if(session&&mode!=='password')return <><Daybook key={session.user.id}/><button className="account-signout no-print" onClick={async()=>{if(!confirm('Sign out? Export any unsaved changes first.'))return;const {error}=await supabase.auth.signOut({scope:'local'});if(error)alert(error.message);}}>Sign out</button></>;
 return <main className="auth-shell"><p className="brand">daybook</p><p className="meta">Edition / Your private workspace</p><h1>{mode==='signup'?'A fresh page.':mode==='reset'?'Reset your password.':mode==='password'?'Choose a new password.':'Make room for today.'}</h1><p>Projects, plans and paperwork. Together.</p><form onSubmit={submit}>{mode!=='password'&&<label>Email<input name="email" type="email" autoComplete="email" required/></label>}{mode!=='reset'&&<label>Password<input name="password" type="password" autoComplete={mode==='signin'?'current-password':'new-password'} minLength={mode==='signin'?1:12} required/></label>}<button className="primary" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?'Send reset link':mode==='password'?'Save password':'Sign in'}</button></form><p role="status">{message}</p>{mode!=='password'&&<div className="row"><button onClick={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('');}}>{mode==='signup'?'Back to sign in':'Create an account'}</button><button onClick={()=>{setMode(mode==='reset'?'signin':'reset');setMessage('');}}>{mode==='reset'?'Back to sign in':'Forgot password?'}</button></div>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
