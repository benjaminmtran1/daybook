/** Online-only worker; no offline data, permission request or push subscription. */
export async function registerDaybookWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  return navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname });
}
