import {OAuth2Client} from 'google-auth-library';
import {randomSecret,pkceChallenge,stateHash} from '../security.ts';
import {googleAuthorizationUrl,GOOGLE_READ_SCOPES,GOOGLE_CREATE_SCOPE} from '../providers.ts';
export function googleOAuth(config,repository,vault,clientFactory=()=>new OAuth2Client(config.clientId,config.clientSecret,config.redirectUri)){
 const clock=config.now||Date.now;
 return {
  async begin(ownerId,create=false){
   const state=randomSecret(),verifier=randomSecret(),transactionNonce=randomSecret(),connectionId=crypto.randomUUID();
   await repository.putState({hash:await stateHash(state),nonceHash:await stateHash(transactionNonce),ownerId,connectionId,verifier:await vault.seal({verifier,create},ownerId,connectionId),expiresAt:new Date(clock()+10*60*1000).toISOString(),redirectUri:config.redirectUri});
   return {transactionNonce,authorizationUrl:googleAuthorizationUrl({clientId:config.clientId,redirectUri:config.redirectUri,state,challenge:await pkceChallenge(verifier),create})};
  },
  async callback({state,code,error},ownerId,transactionNonce){
   if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state))throw Error('Invalid calendar authorization state.');
   if(!ownerId||typeof transactionNonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(transactionNonce))throw Error('Complete calendar authorization in the browser where it started.');
   const stored=await repository.consumeState(await stateHash(state),new Date(clock()).toISOString(),ownerId,await stateHash(transactionNonce));
   if(!stored||stored.ownerId!==ownerId||stored.redirectUri!==config.redirectUri||Date.parse(stored.expiresAt)<=clock())throw Error('Calendar authorization expired or was already used.');
   if(error||typeof code!=='string'||!code||code.length>4096)throw Error('Calendar authorization was not completed.');
   const {verifier,create}=await vault.open(stored.verifier,stored.ownerId,stored.connectionId);
   const client=clientFactory();let tokens;
   try{({tokens}=await client.getToken({code,codeVerifier:verifier,redirect_uri:config.redirectUri}));}catch{throw Error('Could not complete Google Calendar authorization.');}
   const granted=(tokens.scope||'').split(' ');const required=[...GOOGLE_READ_SCOPES,...(create?[GOOGLE_CREATE_SCOPE]:[])];
   if(required.some(scope=>!granted.includes(scope))||!tokens.refresh_token||!tokens.access_token){
    if(tokens.access_token)try{await client.revokeToken(tokens.access_token);}catch{/* Never log token-bearing errors. */}
    throw Error('Google Calendar access was incomplete. Please authorize the requested calendar access again.');
   }
   await repository.saveConnection({id:stored.connectionId,ownerId:stored.ownerId,provider:'google',scopes:granted,credentials:await vault.seal(tokens,stored.ownerId,stored.connectionId)});
   return {provider:'google'};
  },
  async access(connection){
   let current=await vault.open(connection.credentials,connection.ownerId,connection.id);
   if(current.access_token&&current.expiry_date>clock()+60000)return current.access_token;
   const lease=crypto.randomUUID();
   if(!await repository.claimRefresh(connection.ownerId,connection.id,lease))throw Error('Calendar refresh is already running. Retry shortly.');
   try{
    const latest=await repository.connection(connection.ownerId,connection.id);
    if(!latest||latest.state!=='connected')throw Error('Reconnect Google Calendar.');
    current=await vault.open(latest.credentials,connection.ownerId,connection.id);
    if(current.access_token&&current.expiry_date>clock()+60000)return current.access_token;
    if(!current.refresh_token){await repository.markReconnect(connection.ownerId,connection.id,lease);throw Error('Reconnect Google Calendar.');}
    const client=clientFactory();client.setCredentials(current);
    try{
     const {credentials:next}=await client.refreshAccessToken();
     const merged={...current,...next,refresh_token:next.refresh_token||current.refresh_token};
     if(!merged.access_token||!merged.expiry_date)throw Error('Invalid token response.');
     if(!await repository.updateCredentials(connection.ownerId,connection.id,await vault.seal(merged,connection.ownerId,connection.id),lease))throw Error('Calendar refresh ownership changed.');
     return merged.access_token;
    }catch(error){
     if(error?.response?.data?.error==='invalid_grant')await repository.markReconnect(connection.ownerId,connection.id,lease);
     throw Error('Google Calendar access could not be refreshed. Reconnect if access was revoked.');
    }
   }finally{await repository.releaseRefresh(connection.ownerId,connection.id,lease);}
  },
  async disconnect(connection){
   const tokens=await vault.open(connection.credentials,connection.ownerId,connection.id);const token=tokens.refresh_token||tokens.access_token;let revoked=!token;
   if(token)try{await clientFactory().revokeToken(token);revoked=true;}catch{/* Local disconnect still removes credentials. */}
   await repository.removeConnection(connection.ownerId,connection.id);
   return {disconnected:true,providerRevoked:revoked,...(!revoked?{message:'Daybook disconnected locally. Remove Daybook access in your Google Account to finish revocation.'}:{})};
  },
 };
}
