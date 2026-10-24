// Draft Edge entrypoint. Deployment and persistent credentials require approval.
// The wrapper is fail-closed unless CALENDAR_GATEWAY_ENABLED=true and all required
// server configuration is present. It never provisions credentials itself.
import {createEdgeHandler} from './handler.ts';
Deno.serve(createEdgeHandler(name=>Deno.env.get(name)));
