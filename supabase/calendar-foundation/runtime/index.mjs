import {Buffer} from 'node:buffer';
import {createClient} from '@supabase/supabase-js';
import {credentialVault} from './vault.mjs';
import {calendarRepository} from './repository.mjs';
import {googleOAuth} from './oauth.mjs';
import {createCalendarHandler} from './handler.mjs';
/** Build only after deployment/credential approval. Never use VITE_ variables here. */
export function fromEnvironment(env){
 const requireValue=name=>{const value=env[name];if(!value)throw Error('Missing server configuration: '+name);return value;};
 const config={enabled:env.CALENDAR_GATEWAY_ENABLED==='true',icloudOnboarding:env.CALENDAR_ICLOUD_ONBOARDING==='true',appOrigin:requireValue('CALENDAR_APP_ORIGIN'),appReturnUrl:requireValue('CALENDAR_APP_RETURN_URL'),clientId:requireValue('GOOGLE_CALENDAR_CLIENT_ID'),clientSecret:requireValue('GOOGLE_CALENDAR_CLIENT_SECRET'),redirectUri:requireValue('GOOGLE_CALENDAR_REDIRECT_URI')};
 const url=requireValue('SUPABASE_URL');if(new URL(url).protocol!=='https:')throw Error('Use HTTPS Supabase URL.');
 const client=createClient(url,requireValue('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const repository=calendarRepository(client);
 const vault=credentialVault(new Uint8Array(Buffer.from(requireValue('CALENDAR_ENCRYPTION_KEY_BASE64'),'base64')),env.CALENDAR_ENCRYPTION_KEY_VERSION||'1');
 const oauth=googleOAuth(config,repository,vault);
 return createCalendarHandler({config,repository,vault,oauth,auth:async token=>{const {data,error}=await client.auth.getUser(token);if(error)throw Error('Authentication failed.');return data.user;}});
}
