/** Service-role client only; caller must authenticate before supplying ownerId. */
export function calendarRepository(client){
 async function rpc(op,ownerId=null,data={}){const {data:result,error}=await client.rpc('daybook_calendar_repository',{operation:op,owner:ownerId,input:data});if(error)throw Error('Calendar storage operation failed.');return result;}
 const connection=row=>row&&({id:row.id,ownerId:row.owner_id,provider:row.provider,state:row.state,scopes:row.granted_scopes,credentials:row.encrypted_credentials});
 return {
  rateLimit:owner=>rpc('rate_limit',owner),
  claimRefresh:(owner,id,lease)=>rpc('claim_refresh',owner,{id,lease}),
  releaseRefresh:(owner,id,lease)=>rpc('release_refresh',owner,{id,lease}),
  putState:value=>rpc('put_state',value.ownerId,value),
  async consumeState(hash,now,owner,nonceHash){const row=await rpc('consume_state',owner,{hash,now,nonceHash});return row&&{ownerId:row.owner_id,connectionId:row.connection_id,verifier:row.encrypted_verifier,expiresAt:row.expires_at,redirectUri:row.redirect_uri};},
  saveConnection:value=>rpc('save_connection',value.ownerId,value),
  async connection(owner,id){return connection(await rpc('connection',owner,{id}));},
  async connections(owner){return (await rpc('connections',owner)||[]).map(connection);},
  updateCredentials:(owner,id,credentials,lease)=>rpc('credentials',owner,{id,credentials,lease}),
  markReconnect:(owner,id,lease)=>rpc('reconnect',owner,{id,lease}),
  removeConnection:(owner,id)=>rpc('remove',owner,{id}),
  selections:(owner,id)=>rpc('selections',owner,{id}),
  select:(owner,id,calendars)=>rpc('select',owner,{id,calendars}),
  cancelUnreserved:(owner,id,calendarId,requestId,key,payloadHash)=>rpc('cancel_unreserved',owner,{id,calendarId,requestId,key,payloadHash}),
  creation:(owner,key)=>rpc('creation',owner,{key}),
  reserve:(owner,id,calendarId,requestId,key,payloadHash)=>rpc('reserve',owner,{id,calendarId,requestId,key,payloadHash}),
  finish:(owner,key)=>rpc('finish',owner,{key}),
 };
}
