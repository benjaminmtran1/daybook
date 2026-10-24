export type PushTask = { id: string; deadline: string; done: boolean };
export type PushPreferences = { enabled: boolean; timeZone: string; morning: string | null; evening: string | null; due: string | null; quietStart: string; quietEnd: string; taskAlerts: { taskId: string; at: string }[] };
export type PushSubscriptionData = { endpoint: string; keys: { p256dh: string; auth: string } };
export const defaultPushPreferences: PushPreferences = { enabled: false, timeZone: 'America/Toronto', morning: '08:00', evening: '18:00', due: '09:00', quietStart: '22:00', quietEnd: '07:00', taskAlerts: [] };
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function validatePreferences(input: unknown): PushPreferences {
  if (!input || typeof input !== 'object') throw Error('Invalid preferences');
  const p = input as Record<string, unknown>;
  if (typeof p.enabled !== 'boolean' || typeof p.timeZone !== 'string' || p.timeZone.length > 100) throw Error('Invalid preferences');
  try { new Intl.DateTimeFormat('en', { timeZone: p.timeZone }).format(); } catch { throw Error('Invalid timezone'); }
  for (const name of ['morning', 'evening', 'due']) if (p[name] !== null && (typeof p[name] !== 'string' || !time.test(p[name] as string))) throw Error('Invalid reminder time');
  for (const name of ['quietStart', 'quietEnd']) if (typeof p[name] !== 'string' || !time.test(p[name] as string)) throw Error('Invalid quiet time');
  if (!Array.isArray(p.taskAlerts) || p.taskAlerts.length > 200) throw Error('At most 200 task alerts');
  const alerts = p.taskAlerts.map((a: unknown) => {
    if (!a || typeof a !== 'object') throw Error('Invalid task alert');
    const value = a as Record<string, unknown>;
    if (typeof value.taskId !== 'string' || !value.taskId || value.taskId.length > 100 || typeof value.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.at) || !Number.isFinite(Date.parse(value.at)) || new Date(value.at).toISOString() !== value.at) throw Error('Invalid task alert');
    return { taskId: value.taskId, at: value.at };
  });
  if (new Set(alerts.map(a => a.taskId)).size !== alerts.length) throw Error('Only one alert per task');
  return { enabled: p.enabled, timeZone: p.timeZone, morning: p.morning as string|null, evening: p.evening as string|null, due: p.due as string|null, quietStart: p.quietStart as string, quietEnd: p.quietEnd as string, taskAlerts: alerts };
}
export function validateSubscription(input: unknown): PushSubscriptionData {
  const s = input as PushSubscriptionData;
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 2048) throw Error('Invalid push endpoint');
  let url: URL; try { url = new URL(s.endpoint); } catch { throw Error('Invalid push endpoint'); }
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host === 'push.services.mozilla.com' || host === 'web.push.apple.com' || host.endsWith('.push.apple.com');
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || !url.pathname || url.pathname === '/') throw Error('Unsupported push provider');
  // P-256 uncompressed public point (65 bytes) and 16-byte auth secret, URL-safe base64.
  if (!s.keys || !/^[A-Za-z0-9_-]{87}=?$/.test(s.keys.p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(s.keys.auth)) throw Error('Invalid subscription keys');
  return { endpoint: url.href, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}
export function wallClock(now: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(now);
  const p = (name: string) => values.find(v => v.type === name)!.value;
  return { day: `${p('year')}-${p('month')}-${p('day')}`, time: `${p('hour')}:${p('minute')}` };
}
const minutes = (t: string) => Number(t.slice(0,2))*60 + Number(t.slice(3));
export function inQuietHours(at: string, start: string, end: string) { return start === end ? false : start < end ? at >= start && at < end : at >= start || at < end; }
/** Candidate generation, not delivery. Fifteen-minute window, no next-day catch-up. */
export function planPush(tasks: readonly PushTask[], input: PushPreferences, now: Date): { key: string; kind: string }[] {
  const p = validatePreferences(input);
  if (!p.enabled) return [];
  const local = wallClock(now, p.timeZone);
  if (inQuietHours(local.time, p.quietStart, p.quietEnd)) return [];
  const result: { key: string; kind: string }[] = [];
  for (const kind of ['morning','evening','due'] as const) {
    const at = p[kind];
    if (!at || inQuietHours(at, p.quietStart, p.quietEnd)) continue;
    const age = minutes(local.time) - minutes(at);
    if (age >= 0 && age < 15 && (kind !== 'due' || tasks.some(t => !t.done && t.deadline === local.day))) result.push({ key:`${local.day}:${kind}`, kind });
  }
  const minuteGroups = new Set<string>();
  for (const alert of [...p.taskAlerts].sort((a,b)=>a.at.localeCompare(b.at))) {
    const age = now.getTime() - Date.parse(alert.at);
    if (age < 0 || age >= 15*60000 || !tasks.some(t=>t.id===alert.taskId&&!t.done)) continue;
    const scheduled = wallClock(new Date(alert.at),p.timeZone);
    if (inQuietHours(scheduled.time,p.quietStart,p.quietEnd)) continue;
    // Several tasks at the same instant need one generic notification, not a lock-screen flood.
    const key=`task-minute:${alert.at.slice(0,16)}Z`;
    if(!minuteGroups.has(key)){minuteGroups.add(key);result.push({key,kind:'task'});}
  }
  return result;
}
export function privateNotification(_eventKey: string) {
  // Deliberately no task title, date, user ID, counts, financial details or destination URL.
  return { title: 'Daybook', body: 'Your Daybook reminder is ready. Open Daybook to review.', tag: 'daybook-reminder' };
}
export type PushRow = { id: string; owner_id: string; subscription: PushSubscriptionData; preferences: PushPreferences };
export type DispatcherAdapter = {
  tasks(ownerId: string): Promise<PushTask[]>;
  canSend?(): boolean;
  active(id: string, ownerId: string): Promise<PushRow | null>;
  claim(subscriptionId: string, key: string): Promise<boolean>;
  finish(subscriptionId: string, key: string, state: 'accepted'|'rejected'|'unknown'): Promise<void>;
  remove(subscriptionId: string): Promise<void>;
  send(subscription: PushSubscriptionData, payload: ReturnType<typeof privateNotification>): Promise<void>;
};
/** Atomic claim is durable BEFORE transmission. An uncertain outcome is never automatically retried. */
export async function dispatchSubscription(row: PushRow, now: Date, adapter: DispatcherAdapter) {
  let attempted = 0;
  const tasks = await adapter.tasks(row.owner_id);
  for (const candidate of planPush(tasks, row.preferences, now)) {
    if (attempted >= 10 || (adapter.canSend && !adapter.canSend())) break;
    const current = await adapter.active(row.id, row.owner_id);
    if (!current || !planPush(await adapter.tasks(row.owner_id),current.preferences,now).some(c=>c.key===candidate.key)) continue;
    if (adapter.canSend && !adapter.canSend()) break;
    if (!await adapter.claim(row.id, candidate.key)) continue;
    attempted++;
    try {
      await adapter.send(validateSubscription(current.subscription), privateNotification(candidate.key));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      await adapter.finish(row.id,candidate.key,status ? 'rejected' : 'unknown');
      if (status === 404 || status === 410) { await adapter.remove(row.id); break; }
      continue;
    }
    await adapter.finish(row.id,candidate.key,'accepted');
  }
  return { attempted };
}
