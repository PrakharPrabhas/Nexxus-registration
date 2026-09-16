# NEXXUS — Nexxathon Portal

A clean registration and operations portal for Nexxathon.

## Product decisions

- **Problem statements are the primary challenge unit.**
- **Tracks are filters/categories, not registration choices.**
- Teams register first and can choose a problem statement later.
- Maximum team capacity is four members.
- Admins can publish/edit/delete problem statements, manage teams and participants, approve members, publish announcements and resolve support tickets.
- No fixed institution/college branding is hard-coded into the portal.

## Run locally

1. Install Node.js 18+.
2. Copy `.env.example` to `.env`.
3. Set the required Supabase and security environment variables.
4. Run `npm install`.
5. Run `npm start`.
6. Open `/` for the participant portal and `/admin` for operations.

## Environment variables

`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ENCRYPTION_KEY`, `JWT_SECRET`, `ADMIN_PASSWORD` are required for production. `ALLOWED_ORIGINS` is optional and accepts a comma-separated list.

Do not commit `.env`, credentials or service keys.

## Supabase

Run `supabase_schema.sql` in the Supabase SQL editor before first use. The schema intentionally does not create public CRUD policies; the Express server is the application security boundary.

## Deployment

This package is prepared for a standard Node/Express deployment. Configure environment variables in your hosting provider rather than editing source code.

## Supabase configuration (important)

Set `SUPABASE_URL` to the project URL, for example `https://YOUR_PROJECT_REF.supabase.co`.
The backend automatically normalizes this to `/rest/v1`, so both the project URL and a full `/rest/v1` URL are accepted.

Set `SUPABASE_SECRET_KEY` to the Secret key from the same Supabase project. Current `sb_secret_*` keys are sent only through the `apikey` header; they are not JWT bearer tokens.

After starting the server, verify the database connection at `/api/health/supabase`. If it returns `503`, do not troubleshoot the SQL schema first: fix the Supabase URL/key pairing in `.env`.
