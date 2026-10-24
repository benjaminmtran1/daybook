# Daybook device integrations

Checked 24 October 2026. Source additions only, not a production deployment or real-device acceptance test. No notification/location permissions, provider credentials, paid services, native signing, or production settings were changed.

## Implemented foundation

- `web/DeviceReminders.tsx` and `device-reminders.ts`: opt-in **foreground-only** morning planning, evening review and deadline-day prompts. Local account/browser preferences; dismissals; Toronto timezone including DST; completed tasks excluded. It checks while visible and on return, not at an exact guaranteed delivery time. No previous-day replay. Scheduled task time is NOT a custom reminder time. This does not fulfill closed-app/background notifications.
- `web/public/manifest.webmanifest`, 192/512px app icons, 180px Apple touch icon, online-only `sw.js`, and `web/pwa.ts`: install-ready web app foundation, relative paths for GitHub Pages `/daybook/` and future subdomain root. Worker deliberately does not intercept requests or cache private records. Its generic-content push/click handlers are inert until an explicitly configured service and user subscription exist. **Online-only**, not offline-first. Install is not a native timeline/capture widget. A domain move creates a different origin: existing installs, login sessions, local preferences and any eventual push subscriptions do not migrate automatically.

## App integration

1. In `index.html` head add `<link rel="manifest" href="%BASE_URL%manifest.webmanifest">`, `<link rel="apple-touch-icon" href="%BASE_URL%daybook-180.png">`, and `<meta name="apple-mobile-web-app-capable" content="yes">`.
2. Import `registerDaybookWorker` from `./pwa`; call once from the app entry, catching and reporting registration failure without blocking login. No permission prompts are performed.
3. Mount `DeviceReminders` only with loaded authenticated records: `<DeviceReminders key={ownerId} ownerId={ownerId} tasks={data.tasks} showSettings={view === 'settings'} />`. Keep mounted across views. The account key prevents preferences leaking across account changes.
4. Explain installation in Settings: on supported iPhone/iPad use Share → Add to Home Screen and open that icon; on supported Mac Safari use File → Add to Dock. Browser menu wording can vary. Internet remains required. Don't promise offline use or notifications.
5. Run `npm test` and `npm run build` in `web`; verify final hosted manifest, icon and worker URLs after any base/domain change. Test install, relaunch, sign-in, logout and upgrade on actual iPhone/iPad/Mac. No such real-device QA has been done in this task.

## Remaining feature status and safe next steps

### Closed-app, chosen-date/time, morning/evening and due alerts: feasible, not connected

Apple supports standards-based Web Push for Home Screen apps on iOS/iPadOS 16.4+; permission must follow a direct user gesture. Safari on compatible Macs also supports Web Push. This is not a blanket web-platform blocker. Push delivery can still be delayed or suppressed by OS/user settings; don't promise alarm-clock precision.

Smallest route: keep GitHub Pages frontend and use the existing Supabase backend for authenticated push subscription storage plus a scheduled sender. Supabase documents Cron invoking Edge Functions. No separate paid push vendor is inherently required, but the account's limits/costs must be checked before activation.

Still required before production: user-approved persistent VAPID credential setup; owner-scoped subscription/preferences schema and RLS; authenticated subscribe/unsubscribe endpoint; safe endpoint validation; timezone-aware due-job selection and idempotency; cancellable/reschedulable task reminders; service-worker push/click handlers; server-side signing and sender; expiration cleanup; opt-in user gesture UI and successful real-device delivery tests with the app closed. Private keys and service-role credentials must never ship to the frontend. Default notification content should be generic to avoid task details on lock screens. Any credential creation or permissions need appropriate action-time approval. None was requested automatically here.

Sources: [WebKit: Web Push on iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple: sending Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Supabase: scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

### Native timeline/capture widget: parked by user

WidgetKit uses a native app extension, not a web manifest or Home Screen icon. Simplest full implementation is a small signed Apple companion app sharing Daybook's authenticated backend, with a read-only timeline WidgetKit extension and deep-link capture action. Requires native app project, secure account/session-sharing design, Apple distribution/signing decision, build environment and real-device QA. The user asked to work out the current web v1 quirks before introducing another build, so the native companion is parked rather than started. Keep the web app independently usable.

Source: [Apple: creating a widget extension](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension).

### Arrival/departure reminders: native companion required for dependable background behavior

Web geolocation is scoped to fully active visible documents. A browser watchPosition loop is not reliable background geofencing and must not be presented as such. Native Core Location monitors regions and can wake the iOS app; macOS monitoring requires a running app and awake system. Apple's system imposes region limits, permissions and lifecycle constraints, so this still needs real-device acceptance testing.

The user has parked the native companion until the existing web v1 is polished. If revisited later, include location reminders in that companion with explicit per-place opt-in and native permission requests. Do not obtain or transmit location just to probe support. Apple Reminders remains separate; it has not been chosen as a workaround or integration.

Sources: [W3C Geolocation](https://www.w3.org/TR/geolocation/), [Apple: monitoring proximity to geographic regions](https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions), [Apple: background location updates](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background).

### Calendar

The user has confirmed both Google and iCloud calendar. See [calendar connection status](web/CALENDAR_CONNECTIONS.md) for the implementation and activation requirements. File export is not two-way synchronization.

## Verification completed in this task

14 focused tests passed (`node --experimental-strip-types --test tests/device*.test.mjs` in `web`): opt-in defaults, malformed settings, Toronto dates, timing boundaries, completion filtering, dismissal/deduplication, new-day handling, DST repeated-hour identity, rendered disclosure/default controls, no permission API use, manifest scope on both hosting shapes and icon sizes. TypeScript plus Vite production build passed (existing large-bundle warning). These tests are not closed-app delivery, live-host, real-device installation, or native-widget/geofence acceptance tests.

## Background push draft

A disabled implementation now exists for authenticated subscriptions, owner-bound preferences, deadline/morning/evening/custom-task scheduling candidates, quiet hours, durable per-device deduplication, opt-in UI and generic service-worker notifications. It has not been activated or tested against a live push provider. See [activation gates and verification](PUSH_ACTIVATION.md).
