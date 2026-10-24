import { validatePreferences, validateSubscription, type PushPreferences, type PushSubscriptionData, type PushTask } from './core.ts';
export type PushApiStore = {
  tasks(owner: string): Promise<PushTask[]>;
  get(owner: string, endpoint: string): Promise<{ preferences: PushPreferences } | null>;
  subscribe(owner: string, subscription: PushSubscriptionData, preferences: PushPreferences): Promise<void>;
  update(owner: string, endpoint: string, preferences: PushPreferences): Promise<void>;
  remove(owner: string, endpoint: string): Promise<void>;
};
export async function handlePushAction(owner: string, input: unknown, store: PushApiStore) {
  if (!owner) throw Error('Authentication required');
  if (!input || typeof input !== 'object') throw Error('Invalid request');
  const body = input as Record<string, unknown>;
  if (body.action === 'subscribe') {
    const subscription = validateSubscription(body.subscription);
    const preferences = validatePreferences(body.preferences);
    await verifyTaskOwnership(owner,preferences,store);
    await store.subscribe(owner,subscription,preferences);
    return { enabled: preferences.enabled };
  }
  if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048) throw Error('Invalid endpoint');
  if (body.action === 'status') return { subscription: await store.get(owner,body.endpoint) };
  if (body.action === 'unsubscribe') { await store.remove(owner,body.endpoint); return { enabled: false }; }
  if (body.action === 'preferences') {
    const preferences = validatePreferences(body.preferences);
    await verifyTaskOwnership(owner,preferences,store);
    await store.update(owner,body.endpoint,preferences);
    return { enabled: preferences.enabled };
  }
  throw Error('Unknown action');
}
async function verifyTaskOwnership(owner: string, preferences: PushPreferences, store: PushApiStore) {
  const tasks = await store.tasks(owner);
  const ids = new Set(tasks.map(t=>t.id));
  if (preferences.taskAlerts.some(a=>!ids.has(a.taskId))) throw Error('Choose a task in your workspace');
}

/** Bound actual streamed bytes, not just a caller-supplied Content-Length. */
export async function readPushBody(request: Request, limit = 60000): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw Error('Request too large');
  if (!request.body) throw Error('Invalid request');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size=0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Request body timed out')),5000);});
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(),timeout]);
      if (done) break;
      size+=value.byteLength;
      if (size>limit) throw Error('Request too large');
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
  finally { if(timer)clearTimeout(timer);reader.releaseLock(); }
}
