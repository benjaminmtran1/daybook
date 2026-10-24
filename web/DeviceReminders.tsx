import { useEffect, useState } from 'react';
import { defaultReminderPreferences, foregroundReminders, readReminderPreferences, reminderClock, type ReminderPreferences, type ReminderTask } from './device-reminders';

type Saved = { preferences: ReminderPreferences; dismissed: string[] };
const blank = (): Saved => ({ preferences: { ...defaultReminderPreferences }, dismissed: [] });
/** Mount with key={ownerId} so changing accounts cannot retain another owner's preferences. */
export default function DeviceReminders({ ownerId, tasks, showSettings = false }: { ownerId: string; tasks: readonly ReminderTask[]; showSettings?: boolean }) {
  const key = `daybook-foreground-reminders-v1:${ownerId}`;
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Saved>(blank);
  const [now, setNow] = useState(() => new Date());
  const [visible, setVisible] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'visible');
  useEffect(() => {
    setSaved(blank()); setError('');
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSaved({ preferences: readReminderPreferences(parsed?.preferences), dismissed: Array.isArray(parsed?.dismissed) ? parsed.dismissed.filter((v: unknown) => typeof v === 'string').slice(-20000) : [] });
      }
    } catch { setError('Reminder settings could not be read. They are off until you enable them again.'); }
  }, [key]);
  useEffect(() => {
    const tick = () => { const shown = document.visibilityState === 'visible'; setVisible(shown); if (shown) setNow(new Date()); };
    const timer = window.setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  function save(next: Saved) {
    const today = reminderClock(new Date()).day;
    next = { ...next, dismissed: next.dismissed.filter(id => id.startsWith(today + ':')) };
    setSaved(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setError(''); }
    catch { setError('This change is active for this session only. Browser storage is unavailable.'); }
  }
  const prompts = visible ? foregroundReminders(tasks, saved.preferences, now, saved.dismissed) : [];
  return <>
    {showSettings && <section className="setting"><h2>In-app planning prompts</h2>
      <p>Optional prompts while Daybook is open and visible. These are not phone notifications and do not alert when the app is closed or in the background. Settings are for this account in this browser only.</p>
      <label><input type="checkbox" checked={saved.preferences.enabled} onChange={e => save({ ...saved, preferences: { ...saved.preferences, enabled: e.target.checked } })} /> Enable in-app prompts</label>
      <div className="row">{(['morning', 'evening', 'due'] as const).map(kind => <label key={kind}>{kind === 'morning' ? 'Morning planning' : kind === 'evening' ? 'Evening review' : 'Tasks due today'}<input type="time" value={saved.preferences[kind]} onChange={e => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) save({ ...saved, preferences: { ...saved.preferences, [kind]: e.target.value } }); }} /></label>)}</div>
      <p className="meta">America/Toronto time. Due prompts use the task deadline, not its scheduled time. Prompts can appear when you return later that day; previous days are not replayed.</p>
    </section>}
    {error && <p role="status">{error}</p>}
    {prompts.length > 0 && <section aria-label="In-app reminders" className="banner"><h2>While you’re here</h2><ul>{prompts.map(prompt => <li key={prompt.id}>{prompt.text} <button type="button" onClick={() => save({ ...saved, dismissed: [...saved.dismissed, prompt.id] })}>Dismiss</button></li>)}</ul></section>}
  </>;
}
