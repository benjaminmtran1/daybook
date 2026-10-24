/* Online-only: no fetch interception or private-data caching.
 * Push stays inactive until a configured service and explicit device opt-in create a subscription.
 * Normal lifecycle: no skipWaiting/clients.claim during active edits.
 */
self.addEventListener('install', () => {});
self.addEventListener('push', event => {
  // Never render provider payload or follow its URLs. Lock-screen content remains generic,
  // even for malformed messages, and every received push has a visible notification.
  event.waitUntil(self.registration.showNotification('Daybook', {
    body: 'Your Daybook reminder is ready. Open Daybook to review.',
    tag: 'daybook-reminder',
    icon: new URL('daybook-192.png', self.registration.scope).href,
    badge: new URL('daybook-192.png', self.registration.scope).href,
    data: { path: self.registration.scope }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL(self.registration.scope);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => {
      const url = new URL(client.url);
      return url.origin === destination.origin && url.pathname.startsWith(destination.pathname);
    });
    if (existing) return existing.focus();
    return self.clients.openWindow(destination.href);
  })());
});
