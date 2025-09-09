# Secret Rotation Checklist (Safe, Minimal Downtime)

Purpose: Rotate sensitive credentials without breaking apps.

## Scope
- JWT Secret (regenerates anon + service_role keys)
- Postgres password (DB connection string)

## Prep (5–10 minutes)
- Identify where keys live:
  - Hosting envs (e.g., Vercel/Netlify): `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`
  - Backend jobs/scripts/cron and CI secrets
  - Local `.env` files
- Schedule a low-traffic window.

## Rotate DB Password (done)
- Settings → Database → Reset database password
- Update DB URL everywhere using session pooler host
  - `postgresql://postgres.<project-ref>:<NEW_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`
- Verify:
  - `psql "$PROD_DATABASE_URL" -c "SELECT now();"`

## Rotate JWT Secret (regenerates keys)
- Settings → JWT Keys → Rotate/Generate new secret
- Copy new keys:
  - Settings → API Keys (or Legacy) → `anon` and `service_role`
- Update everywhere:
  - Hosting envs, backend jobs, CI secrets, local `.env`
- Verify quickly:
  - `curl -i -H "apikey: $NEW_SERVICE_KEY" -H "Authorization: Bearer $NEW_SERVICE_KEY" -H "Prefer: count=exact" "$PROD_SUPABASE_URL/rest/v1/courses?select=id&limit=0"`
  - Expect 200/206 + `Content-Range`.
  - `curl -i -H "apikey: $NEW_ANON_KEY" -H "Authorization: Bearer $NEW_ANON_KEY" "$PROD_SUPABASE_URL/rest/v1/courses?select=id&limit=1"` → Expect 401.

## Rollback Plan
- If any app breaks:
  - Temporarily restore old keys in hosting env (if still valid) while finishing updates.
  - Re-run quick service-key verify; then proceed to rotate again during next window if needed.

## Notes
- Prefer session pooler for DDL/psql connectivity.
- Keep a dated log of rotations and updated targets.
