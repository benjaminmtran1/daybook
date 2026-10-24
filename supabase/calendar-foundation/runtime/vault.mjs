import {Buffer} from 'node:buffer';
const encode=bytes=>Buffer.from(bytes).toString('base64url');
export function credentialVault(keyBytes,keyVersion='1'){
 if(!(keyBytes instanceof Uint8Array)||keyBytes.byteLength!==32)throw Error('Calendar encryption key is not configured.');
 const key=crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt','decrypt']);
 const aad=(owner,id)=>new TextEncoder().encode(JSON.stringify([owner,id,keyVersion]));
 return {
  async seal(value,owner,id){const text=JSON.stringify(value);if(text.length>32000)throw Error('Credential payload too large.');const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(owner,id)},await key,new TextEncoder().encode(text));return {v:keyVersion,iv:encode(iv),ciphertext:encode(data)};},
  async open(envelope,owner,id){if(envelope.v!==keyVersion)throw Error('Credential key version unavailable.');try{const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64url'),additionalData:aad(owner,id)},await key,Buffer.from(envelope.ciphertext,'base64url'));return JSON.parse(new TextDecoder().decode(data));}catch{throw Error('Calendar credential could not be opened.');}},
 };
}
