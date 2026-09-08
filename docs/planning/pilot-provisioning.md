# Pilot data provisioning — operator guide

Tooling for the Procesos de Cambio pilot (remediation PR 4). It prepares
**configuration** for a pilot school in a controlled, reviewable way. It is
deliberately narrow: it never creates users, never assigns docentes, never
creates courses or instances, never answers the Contexto Transversal, and
never marks a template published except through the same validated
publication service the admin UI uses.

Code: `scripts/pilot-provisioning/` · allowlist: `config/pilot-provisioning-targets.json`
· manifests: `config/pilot-manifests/` · tests: `__tests__/scripts/pilot-provisioning/`.

## Two modes, two targets

| Mode | Manifest | Target (allowlist entry) | Environment class | What it may write |
|---|---|---|---|---|
| **Synthetic staging rehearsal** | `pc-pilot-synthetic-v1.json` | `staging` | `staging` | the `[SINTÉTICO]` school row (tenant_kind `qa`), instruments, expectations, year weights, migration plan |
| **Real-pilot configuration** | `pc-pilot-v1.json` (copied from `pc-pilot-v1.template.json`) | `realPilot` | `production` | instruments, expectations, year weights, migration plan for an **existing** school |

A manifest is bound to exactly one mode/target/class combination; the guard
refuses any other pairing (a synthetic manifest can never reach the
production-class target, a real manifest can never reach staging).

Real-pilot mode has **no reset and no delete of any kind**. Synthetic mode has a
manifest-scoped reset that deletes only the rows the manifest derives.

## Guardrails (in the order they run)

1. **Manifest lint** (`manifest.mjs`) — refuses any email outside
   `example.com/.net/.org`, `.test`, `.invalid`; any `eyJ…`, `sb_…`,
   `postgres://` value; any URL; any key named password/secret/token/api key;
   any UUID; any RUT-shaped string; any bare date (except `scenarioEpoch`);
   any minor-data term. Then shape validation: complete frequency config on
   every frecuencia indicator, GT (and GI for non-always-GT grades)
   expectations on every indicator, a migration plan per grade, a template per
   grade, and declared `expectedCounts` equal to the derived counts.
2. **Target guard** (`target-guard.mjs`, pure, no I/O) — the target must be
   `approved: true` with a valid 20-char project ref and an exact
   `https://<ref>.supabase.co` URL; `PILOT_SUPABASE_URL` must equal it
   byte-for-byte; loopback/local hosts, unknown refs, refs of the *other*
   target, non-canonical URLs and mismatched environment classes are refused;
   the service key must be present in the env var the entry names and, when
   JWT-shaped, must carry that ref and `role: service_role`. **There is no
   bypass flag, env override or force option** (tests assert the module
   exports none and reads neither `process.env` nor the command line).
3. **Exact confirmation** for write verbs:
   `--confirm apply:<first 16 hex of manifest digest>:<projectRef>` (or
   `reset:…`). Preflight prints the required string.
4. **Schema attestation** (`schema-attestation.mjs`, review remediation R10)
   — before any stage trusts the database it calls
   `public.pilot_schema_attestation()` (migration `20260908110000`, EXECUTE
   granted to `service_role` only) and compares the sha256 of its canonical
   payload — tables, columns, RLS state, policies, privileges, unique
   indexes, triggers, foreign keys, every foreign key referencing a required
   table, required functions with body md5 and grants — with
   `config/pilot-schema-attestation.json`. A missing expectation, an
   unavailable function, another attestation version, a missing object or a
   digest drift is a stop for preflight, apply, verify and reset; the drift
   stop names the section that moved, never a definition. **There is no
   bypass.** Regenerate the expectation from a fresh `supabase db reset` with
   `node scripts/pilot-provisioning/attest-local-schema.mjs --write`
   whenever a migration lands, and review the diff like any migration.
5. **Client creation** happens only after 1–4 pass. All database access goes
   through one store interface (`store.mjs`) whose write allowlist is:
   `schools` (synthetic only), `ab_migration_plan`, `assessment_templates`,
   `assessment_objectives`, `assessment_modules`, `assessment_indicators`,
   `assessment_year_expectations`, `assessment_entity_year_weights`. Reset may
   additionally delete `assessment_template_snapshots` of owned templates.
   `profiles`, `user_roles`, `assessment_instances`, `school_course_*`,
   `school_transversal_context` are read (counted) only, and apply fails if
   any of their counts change during the run.
6. **Publication** goes through `lib/services/assessment-builder/publishTemplate.ts`,
   the function the admin publish route now calls. A template that fails the
   service's validation (e.g. incomplete frequency config) is left as a draft
   with no snapshot, and apply stops.

## Stages

- `preflight` (read-only): schema attestation (above), then column probes on
  every table the tooling reads or writes; school exists (real) / is absent or exactly ours
  (synthetic); every manifest grade maps to exactly one `ab_grades` row by
  `sort_order` with matching name and `is_always_gt`; existing templates,
  snapshots, expectations, weights and migration-plan rows are classified as
  skip / create / publish / **conflict**; foreign published templates on a
  manifest grade, foreign rows colliding on (area, grade, version|name),
  drifted owned rows, archived owned templates, eligible QA/demo-named
  templates and duplicate eligible templates per area are reported; an
  already-published owned template must carry **exactly** the approved
  snapshot payload (R8, below) or preflight stops; prints
  creates/updates/skips/conflicts/stops/warnings, the untouched-table list and
  the required confirmation. Never writes.
- `apply` (manual, `--confirm`, `--operator`): refuses unless preflight is
  clean; takes a local lock; creates only the missing rows in dependency
  order (school → templates → objectives → modules → indicators →
  expectations → year weights → publish → migration plan); publishes every
  owned draft through the shared service and checks the produced version;
  asserts the untouched counts did not move; runs `verify`; writes an audit
  record to `.pilot-provisioning/audit/` (gitignored). Restartable: an
  interrupted run resumes; a second run is a no-op with the same digest.
- `verify` (read-only): schema attestation; every owned row present and
  exact; each grade's eligible (published, non-archived) set is exactly the
  approved set; each published template has exactly one snapshot at its
  version **and its `snapshot_data` equals the deterministic expected
  published payload** (`snapshot.mjs` reproduces the publish service field
  by field; `snapshot-parity.test.ts` runs the real service and pins the
  equality; the only excluded fields are `published_at`, `published_by` and
  `template.created_at`, plus the `yearWeights` bucket order) — a tampered,
  stale, foreign or missing payload fails with the differing path named;
  frequency config complete; GT/GI expectations complete; migration plan
  complete; no QA/demo-named eligible template; canonical observed digest
  (which now carries every snapshot's content digest) equals the digest the
  manifest predicts.
- `reset` (synthetic only, `--confirm reset:…`): refuses realPilot manifests
  before touching the store; schema attestation, then the attested
  foreign-key graph under the reset parents must equal `CASCADE_EDGES` in
  `reset.mjs` (an edge the tooling does not know refuses); then a
  **recursive descendant inventory** (R9) over that graph: every row in any
  table that references an owned school, template, objective, module,
  indicator, sub-question, expectation, weight, snapshot or migration-plan
  row and is not itself manifest-owned refuses the reset with the table,
  column, parent and ON DELETE action named (CASCADE would delete it, SET
  NULL would mutate it, RESTRICT/NO ACTION would fail mid-way); owned child
  tables are checked by id, every other table is head-counted (no content
  is read); also refuses when a snapshot on an owned template was not
  produced by this manifest; deletes owned rows in FK order and the
  synthetic school last; verifies nothing owned remains.
  `npm run test:pilot-reset-cascade` runs the real stages against the
  loopback stack (attestation match and drift, apply/verify/no-op, snapshot
  tamper and restore, sub-question and instance descendants refusing the
  reset, clean reset, deterministic rerun).

## What Brent must supply (nothing in this PR is runnable against a real project yet)

1. `config/pilot-provisioning-targets.json`: the exact `projectRef` and
   `supabaseUrl` of the **staging** project and of the **pilot** project, and
   `approved: true` per entry. Commit that change through review.
2. At runtime, never committed: `PILOT_SUPABASE_URL` and the service-role key
   in `PILOT_STAGING_SERVICE_ROLE_KEY` / `PILOT_REALPILOT_SERVICE_ROLE_KEY`.
3. Decisions the real manifest cannot be written without: the pilot school
   (`pilotSchoolId`), the participating grades, the approved instruments per
   grade (owner, content, versions), the expectation profile, the frequency
   configuration, and the migration-plan entries. Copy
   `pc-pilot-v1.template.json` to `pc-pilot-v1.json`, fill it, run preflight,
   and have the printed digest approved before `apply`.
4. Optionally `--actor <uuid>` of the admin who is publishing, recorded in
   `snapshot_data.published_by`; without it the nil UUID is recorded and the
   audit record says `nil-actor`.

## Commands

```bash
# Synthetic rehearsal against staging
PILOT_SUPABASE_URL=https://<staging-ref>.supabase.co \
PILOT_STAGING_SERVICE_ROLE_KEY=<from the vault, never in a file> \
npm run pilot:preflight -- --manifest config/pilot-manifests/pc-pilot-synthetic-v1.json --target staging

npm run pilot:apply   -- --manifest config/pilot-manifests/pc-pilot-synthetic-v1.json --target staging \
                         --operator <handle> --confirm apply:<digest16>:<staging-ref>
npm run pilot:verify  -- --manifest config/pilot-manifests/pc-pilot-synthetic-v1.json --target staging
npm run pilot:reset   -- --manifest config/pilot-manifests/pc-pilot-synthetic-v1.json --target staging \
                         --operator <handle> --confirm reset:<digest16>:<staging-ref>

# Real pilot (after the manifest and its digest are approved)
PILOT_SUPABASE_URL=https://<pilot-ref>.supabase.co PILOT_REALPILOT_SERVICE_ROLE_KEY=… \
npm run pilot:preflight -- --manifest config/pilot-manifests/pc-pilot-v1.json --target realPilot
npm run pilot:apply     -- --manifest config/pilot-manifests/pc-pilot-v1.json --target realPilot \
                           --operator <handle> --confirm apply:<digest16>:<pilot-ref>
npm run pilot:verify    -- --manifest config/pilot-manifests/pc-pilot-v1.json --target realPilot
```

The npm scripts run `node --import tsx scripts/pilot-provisioning/cli.mjs`;
the `--import tsx` is what lets the CLI load the TypeScript publish service.
Output is JSON on stdout; a refusal is one line on stderr starting with
`pilot provisioning refused:` and exit code 1.

## What the tooling does NOT authorise

- Any staging or production write outside the tables above, and no write at
  all until Brent approves a target and types the exact confirmation.
- User, profile or role creation (the synthetic personas in the manifest are
  documentation for the rehearsal script; `createdByThisTooling` is forced to
  `false`).
- Docente-to-course assignments, course structures, transversal-context
  answers, assessment instances or responses.
- Publishing by direct table mutation, or inserting snapshots directly.
- Deleting anything in real-pilot mode; deleting foreign rows in synthetic mode.
- Deployments, migrations, or changes to RLS.

## Audit records and the non-production marker

- Every `apply` and `reset` — successful **or failed** — writes an audit
  record to `.pilot-provisioning/audit/` (gitignored). A failure record
  carries `ok: false` and `failure: { stage, reason }`; the reason is
  sanitized first (long tokens, URLs and emails redacted) and the record is
  then linted with the manifest safety rules — a record that still looks
  unsafe is refused rather than written. The refusal printed by the CLI
  names the audit path.
- Every stage result and audit record of a synthetic manifest carries
  `synthetic: true`, `notProduction: true` and the marker
  `[SINTÉTICO — NO PRODUCCIÓN] datos de ensayo, no son evidencia de piloto
  real`; the CLI prints it as a `banner`. Synthetic evidence is never proof
  of real-pilot readiness.

## Known limitations

- The lock is a local `O_EXCL` file under `.pilot-provisioning/locks/`;
  PostgREST offers no advisory lock, so two operators on two machines are not
  serialised by the database.
- The schema attestation compares the catalog picture (definitions, grants,
  RLS state, policies, indexes, triggers, foreign keys, function bodies) —
  not the migration ledger itself, which PostgREST cannot expose. A target
  that reached the same objects by another migration history attests
  identically; a target missing a migration, a grant or a policy does not.
- Apply is restartable rather than transactional: each step re-reads before
  it writes, and a failure leaves a resumable state (drafts without snapshot
  are the only intermediate state; `preflight` shows them as `updates`).
- The `ab_grades` names/`is_always_gt` in the synthetic manifest are the
  values the code expects (`types/assessment-builder.ts`); if staging differs,
  preflight stops and the manifest, not the database, is what gets corrected.
