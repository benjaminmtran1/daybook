/** Server-only helpers. No browser import, logging or client serialization of credentials. */
export function assertICloudUrl(value:string):URL {
 const u=new URL(value);
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.search||!(/^(?:caldav|p\d+-caldav)\.icloud\.com$/i.test(u.hostname)))throw Error('Untrusted iCloud calendar endpoint.');
 return u;
}
export async function pkceChallenge(verifier:string){
 if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))throw Error('Invalid PKCE verifier.');
 return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
}
export function base64url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function randomSecret(){return base64url(crypto.getRandomValues(new Uint8Array(32)));}
export async function stateHash(state:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state))));}
export function validOAuthState(row:{ownerId:string;expiresAt:string;used:boolean}|null,ownerId:string,now=Date.now()){
 return !!row&&row.ownerId===ownerId&&!row.used&&Number.isFinite(Date.parse(row.expiresAt))&&Date.parse(row.expiresAt)>now;
}
export async function createEventKey(ownerId:string,connectionId:string,calendarId:string,requestId:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw Error('A stable request UUID is required.');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([ownerId,connectionId,calendarId,requestId])));
 // Lowercase hex is within Google's base32hex event-ID alphabet.
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function encryptCredential(value:string,key:CryptoKey,ownerId:string,connectionId:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(JSON.stringify([ownerId,connectionId]))},key,new TextEncoder().encode(value));
 return {iv:base64url(iv),ciphertext:base64url(new Uint8Array(ciphertext))};
}
