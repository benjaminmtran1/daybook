# Daybook: GitHub Pages + Supabase

The Pages application is in `web/`. The original Sites app remains in `app/` and has not been redeployed or migrated.

## Build and publish

Requires Node 22.13 or newer. From `web/`, run `npm ci` then `npm run build`. Commit the generated `docs/` along with source and `web/package-lock.json`. GitHub Pages must publish **main /docs** (Deploy from a branch). The production base path is `/daybook/`.

## Backend

Supabase project `zbuiomquumyebfzdinvv` in Canada Central. `supabase/schema.sql` records the applied initial schema. Do not apply it twice. Workspace rows use authenticated owner policies. The invoker save function uses revision comparisons; stale saves return SQLSTATE 40001. Receipts are in a private bucket with owner-prefixed keys and 60-second signed download URLs. No service-role key belongs in the frontend.

## Authentication configuration required before launch

In Supabase Authentication → URL Configuration set Site URL to `https://benjaminmtran1.github.io/daybook/` and add that same exact URL to Redirect URLs. Keep email confirmation enabled. The frontend supports email/password creation, sign-in, sign-out, and password recovery. Supabase's default mail service may restrict recipients to organization members; configure a custom SMTP provider before inviting other users. Do not disable confirmation to work around mail delivery.

## Data migration

The old Sites account and new email account are separate identities. No existing records or receipt files have been copied. JSON backup restore transfers records only; old receipt references still need their originals re-uploaded into the new workspace. Keep the original Site available until migration has been checked.

## Verification

Typecheck and production build; transaction-scoped database tests for owner isolation, successful saves and stale-save rejection; Supabase security advisor check. Browser signup, email delivery, receipt upload/download and cross-device interaction require a live Pages URL and configured auth redirects before final acceptance.
