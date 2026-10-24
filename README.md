# Daybook / Edition — first build

## GitHub Pages version

The Supabase-backed browser app lives in `web/`; its compiled Pages output is in `docs/`. See [DEPLOYMENT.md](DEPLOYMENT.md) for publishing, authentication settings, verification and data migration limits. The original Sites implementation below is retained unchanged.

### Pages v1 completion work (local review branch)

- Single-task focus with completion/edit controls and keyboard return.
- Open-device refresh every 30 seconds and on return/reconnection, paused for drafts, saves and conflicts.
- Account-bound requests, guarded manual reloads, and safe receipt retry/concurrent-submit handling.
- On-device English photo OCR with explicit per-field review. JPEG/PNG/WebP only; PDFs remain manual.
- Opt-in foreground planning/review/due prompts, not closed-app notifications.

Run `cd web && npm ci && npm test && npm run build`. Automated tests use synthetic data and mocked services; they do not establish live account, storage, mobile, or OCR accuracy acceptance. See the companion feature-completion audit for the original scope and `COMPLETION_STATUS.md` for this branch's verification and open dependencies. No production deployment is implied.

The following sections describe the preserved original Sites build, not a claim that the Pages integration work is complete.

Private personal planning app. Same Sites identity and URL as the original prototype.

## Current build

- Projects in Work and Personal, reusable clients, deadlines, archiving.
- Dated tasks with priorities, duration, quarter-hour scheduling, collision checks, manual rollover and recurrence on completion.
- Local calendar events and explicit `.ics` export; no live calendar connection.
- Multiple Markdown notes per project with arithmetic, variables, fractions, length conversions and cost-list summation.
- Private receipt image/PDF uploads (10 MB), manually reviewed details, expense CSV and printable reimbursement reports.
- Snapshot invoices, reusable seller/client details, selected expenses, editable status, browser PDF printing.
- User-owned D1 records, private R2 attachment paths, optimistic version checking, JSON backups and optional browser-prototype import.

## Locked design

Edition: near-monochrome paper/ink, serif headings, restrained monospace metadata, fine dividers, compact outlined tabs, no dashboard cards. Desktop project navigation and mobile bottom navigation. Dark capture chooser and native modal forms.

## Remaining work

Live calendar reading/creation, receipt OCR, native widgets, scheduled/background notifications, location reminders, automated sync while another device is open, and full browser/device QA. Do not label these connected or production-ready. Voice capture uses keyboard dictation only. Currency CAD; timezone America/Toronto.

## Data

`workspaces` stores one versioned structured document per Sites-authenticated user. Every read/write requires the platform identity; API routes never accept a client-supplied owner. Attachments use `userId/random-id` R2 keys. PUT requires a same-origin request and a matching document revision. A conflict keeps proposed changes in the UI for export and blocks further writes until reload.

Prototype browser data (`daybook-v2`) is never erased. Its import is explicit; imports have deterministic IDs and do not re-import duplicates. Prototype events are omitted because they were simulated. Existing invoice/client snapshots are preserved. JSON backups reference attachments but do not bundle file bytes.

## Checks

Run `npx tsc --noEmit` and `node --experimental-strip-types scripts/test-daybook.mjs`.
Generate schema changes with `npm run db:generate`; commit SQL and metadata. Existing migrations are immutable after deployment. Use the Sites build/publish workflow; do not separately deploy to another host.

Visual browser QA was unavailable for this build. Type checking, pure workflow tests and production build do not replace iPhone interaction and signed-in end-to-end testing.
