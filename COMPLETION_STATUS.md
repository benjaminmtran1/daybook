# Daybook v1 completion work: review status

Baseline: `33f02cae2bc5f1d611f155bd3911f1c95b289961`.
Branch: `work/cloud-feature-wrapup`. This is a local review deliverable, not a published release.

## Implemented in this branch

- Single-task focus surface: same task completion/recurrence/save path, clear Back/Escape, edit and return, restored keyboard focus.
- Automatic refresh on visible open devices every 30 seconds, on window focus and on reconnection. Refresh pauses during forms, saves, hidden/offline state and conflicts. In-flight reads invalidated by local operations cannot overwrite them; existing revision-based save conflicts remain authoritative.
- Manual reload now locks mutations while loading. Account identity and the verified token are bound per backend operation. A delayed receipt upload cannot continue saving a previous account's document after its screen unmounts.
- Duplicate receipt submissions are blocked synchronously; a successful upload is reused when the same form retries a failed workspace save. Abandoned uploads are not automatically deleted, so storage cleanup remains separate.
- Spreadsheet CSV text is protected against formula prefixes, including leading whitespace/control characters. Calendar exports escape carriage returns and fold long Unicode content lines.
- English receipt-photo OCR runs on-device. Users select reviewed suggestions before replacing form fields; nothing is automatically saved. First use downloads public OCR code/model assets. JPEG, PNG and WebP supported; PDF and HEIC OCR remain manual. This is not a guarantee of accounting accuracy.
- Home Screen/Dock install metadata with scoped icons and an online-only worker; no private-record cache or unsolicited permission prompts.
- Optional in-app morning planning, evening review and due-today prompts, off by default and scoped to the current account/browser. These are not phone notifications, scheduled closed-app delivery, or location reminders.

## Implemented but deliberately inactive integrations

- Google and iCloud gateway, selected-calendar picker, read-only Today agenda, explicit destination/create, disconnect and credential lifecycle code. Persistent credentials remain server-only; all connection UI is gated off until approved hosting, schema and secrets are configured. See `web/CALENDAR_CONNECTIONS.md`.
- Web Push opt-in UI, subscription lifecycle, generic lock-screen payload, bounded/idempotent dispatcher and draft Edge adapter/schema. It is off by default; no notification permission, subscription, key or cron job was created. See `PUSH_ACTIVATION.md`.
- Calendar create recovery uses a same-key atomic cancellation marker when no reservation exists, so an abandoned pre-write request cannot execute later. A reservation already in flight is never cancelled blindly; it is reconciled against the provider's deterministic event ID.

## Final verification matrix (2026-10-24)

- Clean frontend dependency install: passed.
- Frontend `npm test`: 132 tests passed, zero failures/skips. Includes all-record backup roundtrip after Zod upgrade.
- Frontend `npm run build`: TypeScript and Vite production bundle passed, using the root `/` base on the prepared cutover branch; all 132 tests reran successfully.
- Calendar runtime clean install and `npm test`: 24 mocked-provider/runtime tests passed.
- Standalone calendar/push TypeScript helper check: passed. Calendar Node module syntax checks: passed.
- Disposable PostgreSQL-WASM suite: 10 behavior cases plus parent test passed (11 Node test entries), including cancellation-first versus reservation-first, ownership and account-deletion cascade. Single connection only.
- Actual OCR engine, pinned production English model, synthetic receipt: all four fields correct, 95% reported text confidence, 4.176 seconds in the final rerun. Not a mobile/real-receipt accuracy claim.
- Production frontend dependency audit: zero reported vulnerabilities.
- Source-only `git diff --check`: passed. The generated vendor bundle contains one whitespace warning inside a dependency string literal; its bytes were preserved rather than trimmed.
- Local Deno 2.9.6: push entrypoint typecheck/import and disabled-handler smoke passed; calendar Edge entrypoint typecheck plus four no-network wrapper tests passed. These are not deployed Supabase Edge acceptance tests.
- NOT RUN/PASSED: real Chromium interaction suites (environment launch/connection blocks), live sign-in/storage/provider flows, real-device install/closed-app push, deployed Supabase Edge runtime, multi-connection Postgres concurrency, production Supabase/Cron/PostgREST activation, DNS/TLS/domain cutover. Node mock tests and the frontend build do not replace these checks.

## Verification

From `web/`:

1. `npm ci` (use `--cache /tmp/daybook-npm-cache` if the default home cache is unavailable).
2. `npm test`: workflow/model, refresh races, account isolation, receipt retry/concurrency, task-focus lifecycle/rendering, OCR parser/worker cancellation, and reminder planning tests.
3. `npm run build`: TypeScript plus Vite production build into `docs/`.

The actual OCR engine also recognized all four expected fields in one clean synthetic receipt using the pinned production English model (95% reported text confidence). See `notes/receipt-ocr-verification.md`; this is not real-receipt/mobile accuracy evidence.

A Vite chunk-size advisory remains. The original Sites app is unchanged and was not rebuilt; the root build command is not the Pages build.

`npm run test:browser` is a separate synthetic-browser fixture. Start `npm run dev -- --host 127.0.0.1` in another terminal first. It intercepts every Supabase request and uses no real account. Set `CHROMIUM_PATH` to an installed Chromium. This fixture was not run successfully in the cloud shell: Chromium's local sockets were blocked, and the elevated execution environment failed during mount setup before launch. It is not counted as passed. No production-auth bypass has been introduced.

## Still required before v1 acceptance

- Real signed-in confirmation/recovery, save/reload, receipt upload/download, cross-device and phone/tablet interactions. Local mocks are not proof of these.
- Activate and verify the implemented Google/iCloud integration with approved hosting, schema, secure credentials, real provider authorization and signed-in browser tests. It is not connected merely because local code and mocks pass. Local event creation/ICS export remain separate.
- Native timeline/capture widgets and location arrival/departure reminders are parked by the latest web-v1-first direction, not claimed implemented. The implemented Web Push code remains disabled pending approved configuration and real-device acceptance; foreground prompts and Home Screen installation are not substitutes for closed-app alerts.
- Receipt OCR accuracy and performance on representative phone photos; PDF/HEIC extraction if required. All suggested amounts/dates need review.
- Original Site migration, including original receipt binaries, reconciled counts and opened attachments. JSON backups contain references, not files; keep the old Site intact.
- Subdomain migration to `daybook.benjamintran.ca`: hosting/base path, DNS, TLS and authentication redirects must be verified together. Normal builds on the cutover branch retain root `/`; the explicit rollback override is `DAYBOOK_BASE_PATH=/daybook/`. This patch does not change production DNS, database/auth settings, or existing records.

Recurrence remains completion-triggered and carryover remains explicit. A different missed-occurrence/automatic-rollover policy has not been silently invented.

## Dependency and SQL checks

The Pages app's Zod dependency is pinned to 4.6.7 to address [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Complete synthetic existing-format backups roundtrip without changing known record fields, receipt references or invoice snapshots. `npm audit --omit=dev` in `web/` reports zero known production dependency vulnerabilities after the upgrade. This is not a security guarantee; the original Sites dependency tree was intentionally not changed or audited as part of the Pages patch.

`cd tests/sql && npm ci && npm test` runs the actual drafted SQL against disposable PostgreSQL 17.5 WASM via pinned PGlite. It emulates only the required `auth.users` table and `anon`, `authenticated`, `service_role` roles. The tests exercise SQL application, role denials, owner filtering, OAuth nonce/replay checks, refresh leases, create reservation deduplication, subscription quota/ownership, claim deletion cascade and rate limits. No production database is contacted. PGlite is single-connection: these checks do not establish real multi-connection concurrency, PostgREST behavior, Supabase Auth integration, cron or Edge Function runtime compatibility.
