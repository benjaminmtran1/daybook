# Google and iCloud calendars: implemented gateway, activation gated

## Current user-facing status

**Not connected and not deployed.** Settings correctly says secure setup required for both providers. Calendar file export is still a one-time export, not live sync. No grant was created, real credential collected, live schema applied, or server deployed. Config-gated Settings connection/selection/disconnect controls and Today external agenda/explicit-create UI are now implemented, but not enabled. The external-event editing behavior remains “open its original calendar”; the gateway contains no update/delete/move operation.

## Implemented and tested locally

- `supabase/calendar-foundation/runtime/`: runnable Request/Response server gateway and local Node harness, independent locked dependencies. Server OAuth uses `google-auth-library`; namespace-aware XML uses `@xmldom/xmldom`; recurrence uses `ical.js`.
- Authenticated-owner routing, exact Origin checking, request/body bounds, persistent per-user rate-limit repository, selected-calendar allowlist, server-only encrypted credential store and private-schema/service-role RPC design.
- Google calendar discovery, paginated event reads, explicit create into owned calendars only, token exchange/refresh (including refresh-token rotation/preservation), denied/partial consent handling, and local/provider disconnect.
- OAuth start generates separate random state, PKCE verifier, and browser transaction nonce. GET callback exchanges NO tokens: it returns code/state in a fragment to a fixed validated application URL. Authenticated `google-complete` POST requires the original Daybook owner plus browser nonce; atomic state consumption includes owner and nonce hash. The browser helper removes the fragment before completion. Sharing an authorization URL cannot link a victim's Google account into the initiator's Daybook account.
- Refresh operations use a database lease with a UUID fencing token. Old workers cannot overwrite credentials, mark reconnect, or release a newer lease. Expired leases cannot commit credential changes. A slow refresh can require reconnect rather than guessing about a rotated token.
- iCloud secure onboarding server operation (disabled by default), CalDAV principal/home/collection discovery, namespace-aware REPORT reads, recurring-event/exception/all-day normalization, original iCloud calendar URL, conditional new-event creation and explicit disconnect instructions. No main Apple password field exists.
- SSRF allowlist on all iCloud URLs; HTTPS only; unexpected redirects refused; DTD/entity declarations rejected; response bounds; recurrence expansion capped at 10,000 iterations and read windows at 93 days. Unknown/floating timezones explicitly fail rather than showing guessed times. VTIMEZONE DST changes are fixture-tested.
- Stable per-owner/calendar/request event IDs and atomic create reservations. Duplicate clicks return completed result; a lost response reconciles via GET and payload comparison, never blindly creates another event. New iCloud event uses `If-None-Match: *`; Google uses a deterministic event ID.
- `web/calendar-client.ts`: owner-bound authenticated-invoker contract for status, discovery, selection, reads, create and disconnect, plus ephemeral sessionStorage OAuth transaction handling. It never stores provider tokens or app credentials. Public UI instantiates it only when an approved `VITE_CALENDAR_GATEWAY_URL` is set. The transport accepts only the exact project function endpoint or same-origin `/api/calendar`; it verifies the owner before and after requests and aborts stale operations. Settings includes a separately gated iCloud secure form (`VITE_CALENDAR_ICLOUD_ONBOARDING=true`, default off). Today provides original-event links and an explicit destination/create form, with DST gap rejection and repeated-hour choice. Unresolved create hashes and IDs (not event text or credentials) persist per owner across remount/reload; confirmed reconciliation clears them. Local task conflict checks are explicitly local-only.

## Run and verification

From repository root:

```
cd supabase/calendar-foundation/runtime
npm ci
npm test
npm audit --omit=dev --audit-level=high
```

From `web`: `npm test` and `npx tsc --noEmit`.

Server TypeScript helpers from repository root:

```
web/node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM --module esnext --moduleResolution bundler --allowImportingTsExtensions supabase/calendar-foundation/*.ts
```

After approved configuration only, `npm start` in the runtime directory starts the Node 22.18+ harness on `127.0.0.1:8788` by default. It does not create any credentials or deploy anything. A reverse proxy/server platform must provide HTTPS. The pure `fromEnvironment` factory can be wrapped by the chosen host; the Supabase Edge entrypoint is now supplied at `supabase/functions/daybook-calendar/index.ts`, with pinned per-function imports and a fail-closed wrapper. The Node harness is optional, not a separate paid-host requirement. Deno 2.9.6 checks and four network-forbidden wrapper tests passed on an isolated exact source copy; hosted Supabase Edge acceptance is still pending.

Configuration (server secret manager only, never `VITE_`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- `CALENDAR_APP_ORIGIN` (exact HTTPS origin) and `CALENDAR_APP_RETURN_URL` (same origin, full path such as `/daybook/`, no fragment).
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI` (exact registered HTTPS callback).
- `CALENDAR_ENCRYPTION_KEY_BASE64` (32-byte key) and `CALENDAR_ENCRYPTION_KEY_VERSION`; no production key has been generated. Current vault intentionally fails on unknown key versions. Rotation requires re-encryption before switching versions.
- `CALENDAR_GATEWAY_ENABLED=true` only after review and approval. Without it the handler returns 503.
- `CALENDAR_ICLOUD_ONBOARDING=true` only after the dedicated secure onboarding view and credential collection are approved. It is otherwise disabled.

## Required before activation, not claimed complete

1. Apply/review the two draft SQL files in order (`supabase/calendar-foundation.sql`, then `supabase/calendar-foundation/runtime-repository.sql`) in an approved disposable environment first. The integration owner executed the drafts in disposable PGlite: role denials, owner isolation, OAuth consumption, leases/reservations and rate limits passed. The RPC is SECURITY INVOKER with explicit service-role schema/table permissions, not a browser-executable definer. This is not live Supabase or multi-connection concurrency verification; real RLS/auth/deployment acceptance remains required.
2. Independent review covered account-linking CSRF, service-only SQL, refresh fencing, CalDAV parsing and the config-gated UI. Findings were fixed and unit-tested. Keep the deployment gate until real-provider/host acceptance is complete.
3. Choose/approve host and exact Daybook domain/callback. Provision Google API/OAuth app and approved secrets, consent/testing audience and encryption key custody. Google initial scopes: `calendar.calendarlist.readonly` and `calendar.events.readonly`. Incremental creation scope: `calendar.events.owned`. Shared calendars stay read-only; no broad `calendar` scope is requested.
4. Enable the implemented Settings/Today components only after host and provider setup. Browser fixture `web/tests/calendar-browser.mjs` covers picker, cancelled disconnect, original links, DST gap/repeat, stable retry and cancellation, but was NOT RUN: local Chromium cannot create sandbox sockets and the approved escalation route fails platform mount setup. Run it against Vite on `127.0.0.1:5183` in a working browser environment. No actual secure iCloud credential was entered. The Supabase Edge wrapper/import graph passed local Deno verification. Actual Supabase CLI bundling and hosted runtime/provider acceptance remain unverified; no deployment occurred.
5. Authorize each actual provider connection. iCloud app-specific passwords require Apple 2FA; supported third-party Apple Account authorization is not assumed available to Daybook. Obtain dedicated credentials only in an approved secure form, never in chat. Apple Calendar is an app and can display Google accounts; it is not itself an iCloud account.
6. Run approved real-provider tests, including iCloud host discovery/ACLs and timezone/recurrence variants. Apple does not publish a complete public CalDAV developer contract; transport fixtures are not proof of a working live account. No paid intermediary is assumed.
7. Validate callback code-redaction at the host/proxy (callbacks receive OAuth code in their query; app redirects use fragments), disable request-body/credential logging, configure monitoring with redacted errors, and document key rotation/recovery. Google revocation failure reports local-only disconnection; iCloud requires the user to revoke its app-specific password in Apple Account settings.

## Official references checked 2026-10-24

- Google scopes: https://developers.google.com/workspace/calendar/api/auth
- Google web-server OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
- Apple app-specific passwords/2FA/revocation: https://support.apple.com/en-us/102654
- ICAL.js recurrence: https://github.com/kewisch/ical.js/wiki/Common-Use-Cases
- XML parser project: https://github.com/xmldom/xmldom

Live Supabase project `zbuiomquumyebfzdinvv` was not mutated.

## Latest local verification

27 focused browser-independent calendar tests, 24 server runtime fixture tests, frontend/server TypeScript checks passed. The integration owner ran disposable SQL tests. Runtime npm audit reported zero vulnerabilities. The authored Chromium UI test is explicitly unrun due environment restrictions. No live account acceptance test has occurred.

### Pending-create recovery

Local validation and a definitive first-attempt pre-write rejection do not retain a pending retry record. Unknown network outcomes remain owner-scoped across navigation/reload. “Check earlier creation” reconciles an existing reservation with its provider. If no reservation exists, the service atomically inserts a cancellation tombstone on the same unique request key: a late original request observes cancellation and cannot write. If a pending reservation wins that race, it is never canceled or cleared until reconciled. The browser removes pending metadata only if it still matches that request, so a stale response cannot erase a newer event's retry record. Event titles/details and credentials are not stored in that recovery record.

## Supabase Edge entrypoint (prepared, not deployed)

`supabase/functions/daybook-calendar/index.ts` serves the existing gateway via a lazy, fail-closed wrapper. `handler.ts` returns 503 without initializing credentials when disabled, and 503 if enabled without complete server configuration. `deno.json` pins the npm imports. The proposed platform configuration is only in `supabase/calendar-foundation/edge-config.example.toml`, not an active config.

The example specifies `verify_jwt = false` because Google's callback cannot carry a Daybook JWT. This exact deployment setting needs specific approval. It does not bypass application authentication: every calendar POST independently validates the bearer token with Supabase `getUser`, and the public callback only redirects a fragment. It cannot exchange or store tokens. Authenticated same-owner/browser-nonce completion remains required.

Local verification used Deno 2.9.6 with an isolated exact-layout copy, npm-installed pinned dependencies plus `@types/node@22.19.19`, and manual node_modules resolution because direct Deno npm fetching stalled in this environment. Both entrypoint typecheck and four tests passed with no network permission: disabled handler, missing config, unauthorized POST, and callback without token/storage activity. These do not claim a hosted Edge deployment or a real account connection.

Standard commands in an environment with working Deno npm resolution:

```
deno check --config supabase/functions/daybook-calendar/deno.json supabase/functions/daybook-calendar/index.ts
deno test --allow-env --allow-read --config supabase/functions/daybook-calendar/deno.json supabase/functions/daybook-calendar/handler.test.ts
```

Official dependency/configuration references: https://supabase.com/docs/guides/functions/dependencies and https://supabase.com/docs/guides/functions/function-configuration.
