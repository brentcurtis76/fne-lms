# Publisher bootstrap prerequisite

Branch: `fix/pub-setup`. Base: `1deb9b782cfa8d2ce6e5baad9502e4340f027df7` (remote production main verified 2026-11-16). One bootstrap commit; no application changes.

The authorized urgent Registro-delivery release reached publisher rehearsal successfully, but publication cannot proceed because production lacks `pm_publish.pending`. This prerequisite installs the publisher's exact existing infrastructure through its supported bootstrap path. It does not deliver Registros or change application records.

## Files and risk

- `supabase/migrations/20261116164500_pm_publish_infra.sql`: byte-for-byte copy of the installed `/usr/local/lib/pm-publisher/lib/pmw/sql/d67_infra.sql`. Adds protected publisher reservation metadata, a non-login inspection role, and aggregate-only inspection functions. This is the only migration in this change.
- `PROJECT_STATE.md` and this review request: local evidence and release scope.

Both source and migration SHA-256: `815e151651fa9ee7179dab3aa3c1acae09721b6838885f4dbea38de33efa1f65`.

## Validation

- Exact source/migration SHA-256 match.
- Applied the SQL twice successfully inside a rolled-back transaction in the owned local `registro_lock_probe2` database (localhost port 57622).
- Twelve assertions passed: pending-table RLS; blocked anon/authenticated/service-role access; no inspection-role SELECT on application profiles; expression helper withheld from the inspection role; inspection helper withheld from the application service role; migration version column readable; inspection role remains non-login and non-privileged; row/null/duplicate helpers return the correct synthetic counts.
- Validation log: `/tmp/genera-pub-setup-validation.log` (local evidence, not committed).
- Application build/unit/browser checks are unchanged by this infrastructure-only prerequisite; remote release CI remains required. No production action performed by this agent.

## Reviewer focus

1. Preserve exact installed SQL bytes: bootstrap recognition is hash-based.
2. Keep the migration isolated from the Registro fix: the bootstrap exemption requires every migration in its release to match the installed infrastructure file.
3. Verify capability boundaries: the inspection role has aggregate helpers and migration metadata, not direct application-table reads or expression execution.
4. Publish only through the controlled publisher; do not merge the ordinary application release until this prerequisite is installed.

No credentials, login provisioning, new application access, or application data changes are included. The Registro-delivery release remains separately approved and must be re-proposed after this prerequisite.
