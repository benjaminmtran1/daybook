# Daybook / Edition — first build

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
