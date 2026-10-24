/** Foreground-only reminder planning. No notifications, timers, storage or network side effects. */
export type ReminderPreferences = { enabled: boolean; morning: string; evening: string; due: string };
export type ReminderTask = { id: string; title: string; deadline: string; done: boolean };
export type ForegroundReminder = { id: string; kind: 'morning' | 'evening' | 'due'; text: string };
export const defaultReminderPreferences: ReminderPreferences = { enabled: false, morning: '08:00', evening: '18:00', due: '09:00' };
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function readReminderPreferences(value: unknown): ReminderPreferences {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { enabled: p.enabled === true, ...Object.fromEntries(['morning', 'evening', 'due'].map(k => [k, typeof p[k] === 'string' && timePattern.test(p[k]) ? p[k] : defaultReminderPreferences[k as 'morning']])) } as ReminderPreferences;
}
export function reminderClock(now: Date, timeZone = 'America/Toronto'): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return { day: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}
export function foregroundReminders(tasks: readonly ReminderTask[], preferences: ReminderPreferences, now: Date, dismissed: readonly string[] = [], timeZone = 'America/Toronto'): ForegroundReminder[] {
  const p = readReminderPreferences(preferences);
  if (!p.enabled) return [];
  const { day, time } = reminderClock(now, timeZone);
  const results: ForegroundReminder[] = [];
  // A morning prompt expires when the evening window starts. Nothing catches up previous days.
  if (time >= p.morning && (p.evening <= p.morning || time < p.evening)) results.push({ id: `${day}:morning`, kind: 'morning', text: 'Take a moment to plan today.' });
  if (time >= p.evening) results.push({ id: `${day}:evening`, kind: 'evening', text: 'Review today and choose what comes next.' });
  if (time >= p.due) for (const task of tasks) {
    if (!task.done && task.deadline === day) results.push({ id: `${day}:due:${task.id}`, kind: 'due', text: `Due today: ${task.title}` });
  }
  const hidden = new Set(dismissed);
  const seen = new Set<string>();
  return results.filter(r => { if (hidden.has(r.id) || seen.has(r.id)) return false; seen.add(r.id); return true; });
}
