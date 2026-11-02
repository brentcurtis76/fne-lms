# PASANT participant intake — frozen database contract (DB-01)

Unit PASANT-PARTICIPANT-INTAKE-DB-01. Implements FIRST review §3 (schema) and the pgTAP part of §8, adopted verbatim by plan r2.
Base `bd19809c29bb01f54f757c605f811d778342c915`.

| File | Role |
|---|---|
| `supabase/migrations/20261028020000_pasantias_participant_intake.sql` | additive migration (2 tables, 1 index, 2 triggers, 2 RPCs) |
| `supabase/tests/114-pasantias-participant-intake.sql` | pgTAP, `plan(176)` |

**Status: FROZEN.** Any signature, error code or semantic change goes back through the PM.

**Nothing has been run.** The migration has not been applied and pgTAP 114 has not been executed (see "NOT_RUN").

## 1. Access matrix

| Role | Table privileges (both tables) | Rows | RPC EXECUTE |
|---|---|---|---|
| PUBLIC, anon | none (REVOKE ALL) | – | none |
| authenticated (every role, admins included) | none (REVOKE ALL) | – | none |
| service_role | SELECT, INSERT, UPDATE (no DELETE, TRUNCATE, REFERENCES, TRIGGER) | all (BYPASSRLS) | both |

- Both tables:
  - have RLS enabled;
  - have no permissive policy;
  - have `forced_password_change_guard` installed, which keeps pgTAP 053's catalog invariant green.
- No default-privilege or schema-wide grant changes. Every grant is explicit, so the matrix holds under both the current and the upcoming Supabase defaults.
- Both functions are:
  - `LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''`;
  - use `#variable_conflict error`, and every column reference is alias-qualified (see §5).

## 2. Tables

### `public.pasantias_intake_rosters`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| cohort | text NOT NULL | must be `'enero-2027'` |
| program | text NOT NULL | `inspira` or `mirada-profunda` |
| school_name | text NOT NULL | 2–160 chars; no leading or trailing whitespace |
| school_name_key | text NOT NULL, generated, stored | `lower(regexp_replace(school_name, '[[:space:]]+', ' ', 'g'))` |
| token_hash | text NOT NULL | `^[0-9a-f]{64}$`; UNIQUE |
| expires_at | timestamptz NOT NULL | |
| revoked_at | timestamptz NULL | |
| status | text NOT NULL | default `'open'`; `open` or `submitted` |
| submitted_at | timestamptz NULL | non-null exactly when status = submitted |
| last_submitted_at | timestamptz NULL | kept when the roster reopens |
| version | integer NOT NULL | default 1; at least 1 |
| created_by | uuid NULL | no FK |
| created_at, updated_at | timestamptz NOT NULL | default now(); `set_updated_at` trigger |

Constraint names: `_identity_check`, `_school_name_check`, `_token_hash_check`, `_status_check`, `_submitted_check`, `_version_check`, `_token_hash_key`, `_school_key UNIQUE (cohort, program, school_name_key)`.

### `public.pasantias_intake_participants`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| roster_id | uuid NOT NULL | FK to rosters, `ON DELETE RESTRICT` |
| client_request_id | uuid NOT NULL | UNIQUE (roster_id, client_request_id) |
| first_names, last_names | text NOT NULL | 1–80 chars; no leading or trailing whitespace |
| rut | text NOT NULL | `^[1-9][0-9]{6,7}-[0-9K]$`; UNIQUE (roster_id, rut) |
| passport_number | text NULL | `^[A-Z0-9]{5,20}$` |
| flights_funding, lodging_funding | text NOT NULL, **no default** | `sep` or `colegio` |
| arrival_date, departure_date | date NULL | departure > arrival when both are set; no literal dates |
| focus | text NULL | `infantil`, `primer_ciclo`, `segundo_ciclo` or `tercer_ciclo` |
| dietary_restrictions | text[] NOT NULL | default `'{}'` (= not provided); 1-D, at most 5 elements, each in {`otra`, `sin_gluten`, `sin_lactosa`, `vegano`, `vegetariano`}, no NULL elements |
| dietary_other | text NULL | when set: requires `otra` in the array; 1–200 chars; trimmed |
| acknowledged_at | timestamptz NOT NULL | set to now() by the RPC on every real write |
| notice_version | text NOT NULL | 1–64 chars |
| version | integer NOT NULL | default 1; at least 1 |
| created_at, updated_at | timestamptz NOT NULL | `set_updated_at` trigger |

Index `pasantias_intake_participants_roster_created_idx (roster_id, created_at, id)`.

Constraint names: `_roster_fkey`, `_client_request_key`, `_rut_key`, `_names_check`, `_rut_check`, `_passport_check`, `_funding_check`, `_dates_check`, `_focus_check`, `_dietary_check`, `_dietary_other_check`, `_notice_version_check`, `_version_check`.

## 3. Frozen function signatures

```sql
public.pasantias_intake_save_participant(
  p_token_hash text, p_participant_id uuid, p_expected_version integer, p_client_request_id uuid,
  p_first_names text, p_last_names text, p_rut text, p_passport_number text,
  p_flights_funding text, p_lodging_funding text, p_arrival_date date, p_departure_date date,
  p_focus text, p_dietary_restrictions text[], p_dietary_other text, p_notice_version text)
RETURNS TABLE (participant_id uuid, participant_version integer, replayed boolean,
               roster_status text, roster_version integer)

public.pasantias_intake_finalize(p_token_hash text, p_expected_roster_version integer)
RETURNS TABLE (roster_status text, roster_version integer, submitted_at timestamptz)
```

Both return exactly one row on success. Through supabase-js, call `.rpc(name, {p_…})` and read `data[0]`.

## 4. Errors

Every refusal is `RAISE EXCEPTION '<function>: <code>' USING ERRCODE = '22023'`. PostgREST returns `code: '22023'` and `message: '<function>: <code>'`. The app should match the exact message, not a prefix of it.

### Save errors, in evaluation order

Each check below runs only if the ones above it passed. The first failing check is reported.

| Order | Code | When | Suggested API mapping (§4) |
|---|---|---|---|
| 1 | `invalid_argument` | Mode mismatch: exactly one of id and expected version given; expected version below 1; create without `p_client_request_id` | 500: caller bug, fail closed |
| 2 | `invalid_first_names` / `invalid_last_names` | NULL, outside 1–80 chars, leading or trailing whitespace, or a control character | 422 VALIDATION |
| 3 | `invalid_rut` | Fails `^[1-9][0-9]{6,7}-[0-9K]$`, or the modulo-11 check digit is wrong | 422 VALIDATION |
| 4 | `invalid_passport_number` | Present but fails `^[A-Z0-9]{5,20}$` | 422 VALIDATION |
| 5 | `invalid_flights_funding` / `invalid_lodging_funding` | NULL or not `sep`/`colegio` | 422 VALIDATION |
| 6 | `invalid_dates` | Both dates set and departure ≤ arrival | 422 VALIDATION |
| 7 | `invalid_focus` | Present but not one of the four codes | 422 VALIDATION |
| 8 | `invalid_dietary` | Array is NULL or not 1-D; a NULL or unknown element; not sorted in C order or not distinct; `otra` without a detail, or a detail without `otra`; detail empty, over 200 chars, untrimmed or with a control character | 422 VALIDATION |
| 9 | `invalid_notice_version` | NULL or outside 1–64 chars | 500: the app sets it |
| 10 | `link_unavailable` | Hash NULL or malformed; no roster with that hash that is unrevoked and has `expires_at > now()` (checked under the row lock) | 401 LINK_UNAVAILABLE |
| 11 (create) | `roster_full` | Roster already has 60 participants and this is not a replay | 422 ROSTER_FULL |
| 12 (create) | `duplicate_rut` | RUT already on this roster | 409 DUPLICATE_RUT |
| 11 (update) | `unknown_participant` | Id not on **this** roster; ids from other rosters look identical to nonexistent ones | 404 NOT_FOUND |
| 12 (update) | `stale_version` | Row version ≠ `p_expected_version` | 409 STALE (re-read the row) |
| 13 (update) | `duplicate_rut` | New RUT belongs to another participant of this roster | 409 DUPLICATE_RUT |

### Finalize errors, in evaluation order

| Order | Code | When | Suggested API mapping |
|---|---|---|---|
| 1 | `invalid_argument` | Expected version NULL or below 1 | 500 |
| 2 | `link_unavailable` | Same rule as for save | 401 LINK_UNAVAILABLE |
| 3 | `stale_version` | Version mismatch, outside the idempotent window in §5 | 409 STALE |
| 4 | `empty_roster` | No participants | 422 EMPTY_ROSTER |

Any other SQLSTATE (for example `40001`, or a raw `23505` that only a non-RPC writer could cause) should map to 500 and fail closed.

The argument checks need nothing from the database, so they run before the link lookup. A bad body on a dead link therefore reports the validation code, which reveals nothing about any roster. The API validates the body itself before calling the RPC in any case.

## 5. Semantics

### Lock

- Both RPCs first run `SELECT … FROM rosters r WHERE r.token_hash = $hash AND r.revoked_at IS NULL AND r.expires_at > now() FOR UPDATE`.
- Under READ COMMITTED, a revoke or rotate that commits while a call waits for the lock makes Postgres re-evaluate the predicate on the new row version, so the call gets `link_unavailable` (FIRST-B7).
- The lock and the write happen in one transaction.
- All writes to one roster are serialized. That is what makes the replay, cap and duplicate-RUT checks exact.
- `now()` is the transaction start time.

### Create (`p_participant_id` and `p_expected_version` both NULL)

1. If this roster already has a row with `p_client_request_id`, return that row's id and **current** version with `replayed = true` and no write. **The retry's fields are not applied.** The app must report the saved row, not the retried input (plan r2).
2. Otherwise, if the roster has 60 participants or more, raise `roster_full`.
3. Otherwise, if the RUT is already on the roster, raise `duplicate_rut`.
4. Otherwise insert, with `acknowledged_at = now()`.
5. Returns `replayed = false` and participant version 1.

The client request id lookup is scoped to the token's roster, so another roster's request id is never a replay.

### Update (both given)

- `p_client_request_id` is **ignored**; the stored value never changes.
- Unknown id → `unknown_participant`; version mismatch → `stale_version`.
- **No-op:** if the 11 participant-data fields are identical (`IS NOT DISTINCT FROM`), the call returns `replayed = true` and the current versions, with no write, no version bump and no reopen.
  - The 11 fields: names, RUT, passport, both fundings, both dates, focus, dietary array, dietary detail.
  - `notice_version` and `acknowledged_at` are evidence of a write, not participant data. A call that differs only in `notice_version` is a no-op.
- Otherwise the call writes every field, sets `acknowledged_at = now()` and `notice_version`, and bumps the version.
- **Lost-response retry:** a retry of an update whose response was lost gets `stale_version`, as §3 specifies. The app can compare the current row (the 409 STALE body) with its intent.

### Any real write (create or update)

- Roster `version + 1`, `status = 'open'`, `submitted_at = NULL`.
- `last_submitted_at` is kept.
- Replays and no-ops never touch the roster.

### Finalize

- **Idempotent window:**
  - Applies when the roster is `submitted` and `p_expected_roster_version` is the current version or the current version − 1.
  - The roster is returned **as is**: no write, and `submitted_at` is not re-stamped.
  - Expected = current − 1 is exactly a replay of the finalize that produced the current state, because every participant write leaves the roster `open`.
  - Expected = current means the caller already saw the submitted state.
- A submitted roster with an older expected version → `stale_version`. The caller hasn't seen the intermediate edits.
- Otherwise the roster must be at the expected version and have at least one participant. The call then sets `status = 'submitted'`, `submitted_at = last_submitted_at = now()` and `version + 1`.
- I chose this reading of "if already submitted, return it as is" so that a double-click or retry is idempotent, while a genuinely stale view still gets a 409.

### PL/pgSQL name safety

- The OUT columns `participant_id`, `participant_version`, `replayed`, `roster_status`, `roster_version` and `submitted_at` are PL/pgSQL variables. `submitted_at` is also a roster column.
- Both bodies declare `#variable_conflict error`, so any unqualified ambiguous name fails loudly the first time it runs.
- Every column reference is alias-qualified (`r.`, `p.`, `u.`, `g.`). The only unqualified column names are SET targets and INSERT column lists, which are never variable-substituted.
- Results come back through `RETURN QUERY SELECT v_…` locals.
- pgTAP runs every success path of both functions.

## 6. Admin writes (app author; no DB function, per §3)

Run these as service_role from the admin API.

- **Never select `token_hash` for responses.** List its columns explicitly.
- **Create:**
  ```
  INSERT (cohort 'enero-2027', program, school_name already trimmed, token_hash, expires_at = server now + validDays, created_by)
  ```
  - `23505` on `pasantias_intake_rosters_school_key` → `409 ROSTER_EXISTS`. Look up the id by `cohort`, `program` and `school_name_key`.
  - The key is `lower(regexp_replace(s, '[[:space:]]+', ' ', 'g'))`. JS `s.replace(/\s+/g, ' ').toLowerCase()` matches it for ASCII. For exotic Unicode whitespace the lookup can miss; return 409 without an id in that case.
  - `23505` on `_token_hash_key` is practically impossible; regenerate the token.
- **Rotate:** `UPDATE SET token_hash = new, expires_at = now + validDays, revoked_at = NULL WHERE id = …`. Do not change `version` or `status`.
- **Revoke:** `UPDATE SET revoked_at = <now> WHERE id = … AND revoked_at IS NULL`.
- **Coordinator GET:** read the roster with `eq(token_hash) & is(revoked_at, null) & gt(expires_at, <now>)`, then its participants ordered by `created_at, id`, limit 60. This read uses the app server's clock, while the RPCs use the DB clock (see §7).

## 7. Known limits

1. pgTAP is single-session, so it proves ordering rules and predicates, not real concurrency. Concurrency is proven by the app unit's Playwright `Promise.all` journeys (FIRST N3).
2. The DB checks names only for trimming, length and control characters. NFC normalization, the no-digits rule and the exact es-CL rules live in TypeScript.
3. The RPC verifies the RUT check digit. That goes beyond the §3 table CHECK and is consistent with FIRST-B4; TS and SQL must agree on modulo 11.
4. The dietary array must be sorted in C (code-point) order: `otra < sin_gluten < sin_lactosa < vegano < vegetariano`. JS default `sort()` gives the same order for these ASCII codes.
5. There are no date option sets in the DB (FIRST-B3). Per-program validity is TypeScript only.
6. Participants can't be deleted (N4 is out of scope). The FK is ON DELETE RESTRICT and service_role has no DELETE.
7. The duplicate-RUT and replay checks are exact only for writers that go through the RPC. The unique constraints still backstop anyone else, as a raw `23505` (fail closed).
8. Expiry is compared with `now()`, the transaction start. The coordinator GET compares with the app clock, and small skew is possible at the boundary.
9. The error codes beyond §3's list (`invalid_argument` and the `invalid_<field>` family) are additions so the API gets one code per field. §3's own codes are unchanged.
10. The pgTAP expectations assume:
    - PG ≥ 13 constraint error wording;
    - `public` on the test `search_path` (unqualified FK target in `pg_get_constraintdef`);
    - that `<@` never matches a NULL element.
    Each assumption is pinned by an assertion, so a wrong one fails visibly instead of passing silently.

## 8. pgTAP 114 coverage (`plan(176)`)

- **D1 structure (57 assertions):**
  - exact columns, including generated status and defaults;
  - constraint sets;
  - every CHECK refused one at a time, with the exact message, next to a valid base row (11 roster CHECKs, 23 participant CHECKs);
  - funding with no default (23502);
  - empty-array default;
  - generated key value and case/whitespace uniqueness;
  - index; triggers; FK insert; ON DELETE RESTRICT.
- **D2 access (20):**
  - exact ACLs on both tables and both functions;
  - plpgsql, VOLATILE, SECURITY INVOKER, `search_path=''`;
  - frozen signatures with no overloads;
  - only the restrictive guard;
  - an 11-operation matrix (SELECT/INSERT/UPDATE/DELETE on each table, TRUNCATE, save, finalize) for anon and 12 personas → all 42501, including `admin`, the flagged admin, the inactive admin and no-role; service_role → reads all, writes allowed, DELETE and TRUNCATE denied, RPCs executable.
- **D3 behaviour (99):**
  - create;
  - replay with changed fields not applied;
  - duplicate RUT on create and on update;
  - update with acknowledgement re-stamp and request id kept;
  - stale with nothing written;
  - no-op with no bump, and notice/ack untouched;
  - unknown id; cross-roster id treated as unknown; cross-roster request id not a replay;
  - finalize: stale when open, success, idempotent replay and repeat, stale when submitted;
  - no-op and replay after submission don't reopen; a real edit or a create reopens it, keeping `last_submitted_at`; re-finalize;
  - 49 refused save inputs and 8 refused finalize inputs, then one whole-fixture state check that nothing was written;
  - rotation (old link refused, new link works) and revocation (save and finalize refused);
  - the 60-person cap, with replay still answering when full;
  - empty roster.

## 9. NOT_RUN

Nothing below has been run:
- the migration has not been applied to any database;
- `supabase test db` has not run: 114, and the regression files 001, 053, 112 and 113;
- `npm run guard:migrations` and `npm run guard:secrets` have not run.

The plan count of 176 and every expected string were derived by hand.
