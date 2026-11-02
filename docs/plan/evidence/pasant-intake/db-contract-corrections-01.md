# PASANT participant intake — frozen database contract, corrections 01 (F01 school funding, F04 Todos)

- **Unit:** PASANT-PARTICIPANT-INTAKE-CORRECTIONS-DB-01. It implements the DB portion of FIRST corrections review §3, §6 and §8, adopted by PM with conditions C1–C9.
- **Head:** `ca27b5427513045e89bbb6790e1abc6107009dc6`.
- **Baseline:** this extends `db-contract.md` (DB-01), which stays valid and unchanged for every object it describes.

| File | Role |
|---|---|
| `supabase/migrations/20261030120000_pasantias_nomina_school_funding_focus.sql` | Additive migration: 2 tables, 2 triggers, 2 RPCs |
| `supabase/tests/115-pasantias-nomina-school-funding-focus.sql` | pgTAP, `plan(140)` |

**Status: FROZEN.** Any change to a signature, error code or semantic goes back through the PM.

**Nothing has been run** (see §9).

## 0. Unchanged (C1)
- `pasantias_intake_rosters`, `pasantias_intake_participants`, `pasantias_intake_save_participant` and `pasantias_intake_finalize` are unchanged: no ALTER, DROP, grant, comment, trigger or policy change.
- Migration `20261028020000` and pgTAP 114 are byte-identical, so 114 must still be 176/176.
- The new names avoid every 114 pin:
  - no new column, constraint, trigger, policy or grant on the two DB-01 tables;
  - the new functions are named `pasantias_nomina_*`, which 114's `pasantias\_intake\_%` scan does not match.
- The only effect on the DB-01 tables comes from the new foreign keys:
  - internal RI triggers on the referenced tables, which 114 excludes with `NOT tgisinternal`;
  - pg_constraint rows whose `conrelid` is a new table.

## 1. Who owns the funding (FIRST §3.0)
- The funding owner is the existing roster, which is one school and one program and is exactly what a link reaches.
- A school in both INSPIRA and Mirada Profunda has two independent answers. They are never merged or compared by name.
- No funding row means "Datos del colegio" has not been defined yet. Nothing is guessed or derived from earlier per-person values (C3).

## 2. Tables

### `public.pasantias_nomina_school_funding`

| Column | Type | Rules |
|---|---|---|
| roster_id | uuid | PK (`_pkey`); FK to `pasantias_intake_rosters(id)` ON DELETE RESTRICT (`_roster_fkey`) |
| flights_funding | text NOT NULL, **no default** | `sep` or `colegio` (Pasajes) (`_funding_check`) |
| lodging_funding | text NOT NULL, **no default** | `sep` or `colegio` (Estadía) |
| version | integer NOT NULL | default 1; at least 1 (`_version_check`) |
| created_at, updated_at | timestamptz NOT NULL | default now(); `trg_pasantias_nomina_school_funding_updated_at` |

### `public.pasantias_nomina_participant_focus`

| Column | Type | Rules |
|---|---|---|
| participant_id | uuid | PK (`_pkey`); FK to `pasantias_intake_participants(id)` ON DELETE RESTRICT (`_participant_fkey`) |
| all_levels | boolean NOT NULL, **no default** | `true` = Todos; `false` = a level or no focus. **Never SQL NULL.** |
| created_at, updated_at | timestamptz NOT NULL | `trg_pasantias_nomina_participant_focus_updated_at` |

**Effective focus**, as the app must derive it when reading:

```
all_levels IS TRUE  -> 'todos'
otherwise           -> participants.focus   (a level, or NULL = Sin indicar)
```

A missing focus row counts as `all_levels = false`. Only fixtures, and rows written by the old DB-01 save, lack one.

**Invariants**, maintained by the new RPCs and checked in pgTAP 115:
- **I1:** for every roster that has a funding row, each participant's `flights_funding` and `lodging_funding` equal that row. The participant columns are a copy that nothing should read (C2).
- **I2:** `all_levels = true` implies `participants.focus IS NULL`.

## 3. Access matrix (both new tables)

| Role | Table privileges | Rows | EXECUTE on the new RPCs |
|---|---|---|---|
| PUBLIC, anon | none | – | none |
| authenticated (every role, admins and the flagged admin included) | none | – | none |
| service_role | SELECT, INSERT, UPDATE (no DELETE or TRUNCATE) | all (BYPASSRLS) | both |

- RLS is enabled, with no permissive policy and with `forced_password_change_guard` installed. That keeps pgTAP 053's catalog invariant green.
- No role can delete a funding row, so a roster that has funding keeps it.
- Both functions are plpgsql, `VOLATILE SECURITY INVOKER SET search_path = ''`, with `#variable_conflict error`. Every column reference is alias-qualified.
- The focus upsert uses `ON CONFLICT ON CONSTRAINT pasantias_nomina_participant_focus_pkey`. A column-list conflict target would be ambiguous with the OUT column `participant_id`.

## 4. Frozen signatures

```sql
public.pasantias_nomina_save_school_funding(
  p_token_hash text, p_expected_funding_version integer, p_flights_funding text, p_lodging_funding text)
RETURNS TABLE (funding_flights text, funding_lodging text, funding_version integer, replayed boolean,
               roster_status text, roster_version integer)

public.pasantias_nomina_save_participant(
  p_token_hash text, p_participant_id uuid, p_expected_version integer, p_client_request_id uuid,
  p_first_names text, p_last_names text, p_rut text, p_passport_number text,
  p_arrival_date date, p_departure_date date, p_focus text,
  p_dietary_restrictions text[], p_dietary_other text, p_notice_version text)
RETURNS TABLE (participant_id uuid, participant_version integer, replayed boolean,
               roster_status text, roster_version integer)
```

- Each returns exactly one row on success; supabase-js reads it as `data[0]`.
- Call each with all named `p_…` arguments: 4 for the funding save, 14 for the participant save.
- Finalize is the **unchanged** `public.pasantias_intake_finalize(p_token_hash text, p_expected_roster_version integer)` (FIRST §3.6).

## 5. Errors
Every refusal is SQLSTATE `22023` with message `'<function>: <code>'`. The app should match the exact message, not a prefix of it.

### `pasantias_nomina_save_school_funding`, in evaluation order

| # | Code | When | API (FIRST §4) |
|---|---|---|---|
| 1 | `invalid_argument` | expected version not NULL and below 1 | 500 (caller bug) |
| 2 | `invalid_flights_funding` | NULL, or not `sep` / `colegio` (case-sensitive) | 422 VALIDATION |
| 3 | `invalid_lodging_funding` | same rule for lodging | 422 VALIDATION |
| 4 | `link_unavailable` | hash NULL or malformed; no roster with that hash that is unrevoked and unexpired (checked under the roster lock) | 401 LINK_UNAVAILABLE |
| 5 | `stale_version` | values differ from the stored row and the expected version is not the stored version: NULL expected while a row exists, a number while no row exists, or the wrong number | 409 STALE `{current: roster}` |

A call with the same two values as the stored row is a replay (§6). The replay check runs **before** step 5, so it can never get `stale_version`.

### `pasantias_nomina_save_participant`, in evaluation order
Each check runs only if the ones above it passed.

| # | Code | When | API |
|---|---|---|---|
| 1 | `invalid_argument` | mode mismatch; expected version below 1; create without a client request id | 500 |
| 2 | `invalid_first_names` / `invalid_last_names` | as in DB-01 | 422 VALIDATION |
| 3 | `invalid_rut` | format or modulo-11 check digit | 422 |
| 4 | `invalid_passport_number` | as in DB-01 | 422 |
| 5 | `invalid_dates` | departure ≤ arrival | 422 |
| 6 | `invalid_focus` | not NULL and not one of `infantil`, `primer_ciclo`, `segundo_ciclo`, `tercer_ciclo`, `todos` (exact, lowercase; `Todos` is refused) | 422 |
| 7 | `invalid_dietary` | as in DB-01 | 422 |
| 8 | `invalid_notice_version` | as in DB-01 | 500 |
| 9 | `link_unavailable` | as in DB-01 | 401 |
| **create** | replay | same client request id in this roster: returns the stored row, `replayed = true`, retry fields not applied | 200 |
| 10c | `school_data_missing` | roster has no funding row | 422 SCHOOL_DATA_MISSING |
| 11c | `roster_full` | already 60 participants | 422 ROSTER_FULL |
| 12c | `duplicate_rut` | RUT already on this roster | 409 DUPLICATE_RUT |
| **update** 10u | `unknown_participant` | id not on this roster; other rosters' ids look nonexistent | 404 NOT_FOUND |
| 11u | `stale_version` | version mismatch | 409 STALE |
| update | no-op | data identical: returns `replayed = true`, no write | 200 |
| 12u | `school_data_missing` | roster has no funding row | 422 SCHOOL_DATA_MISSING |
| 13u | `duplicate_rut` | RUT belongs to another participant of the roster | 409 DUPLICATE_RUT |

- There are no funding arguments and no funding codes. A request body with funding keys must get a 422 from the API **before** any RPC call (FIRST R4).
- Any other SQLSTATE should map to 500 and fail closed.

## 6. Semantics

### Lock (unchanged from DB-01)
- Both RPCs `SELECT … FOR UPDATE` the roster through `token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`, then write in the same transaction.
- Every coordinator write to one roster is serialized, and that includes funding saves, participant saves and finalize. A revoke or rotate that commits first wins.

### Funding save
- **Replay:** if the stored row holds the same two values, the call returns it with `replayed = true` under **any** expected version. Nothing is written, nothing is bumped, nothing reopens. This covers double clicks, lost-response retries and two identical concurrent first saves.
- **Optimistic version:** `p_expected_funding_version` is NULL to mean "I expect no row", or else the row's version. Anything else gives `stale_version`. Two competing first saves with different values give one success and one `stale_version`.
- **Real write:**
  - insert at version 1, or update to version + 1;
  - copy the values into every participant of the roster whose copy differs (I1). Participant `version` is **not** bumped, but their `updated_at` changes through the DB-01 trigger;
  - roster `version + 1`, `status = 'open'`, `submitted_at = NULL`. `last_submitted_at` is kept (C4).
- The funding version is independent of participant and roster versions, so participant writes never make a funding save stale. Funding changes reach finalize through the roster version.

### Participant save
This is the DB-01 save without per-person funding. The funding copy is always taken from the school row.

- **Focus mapping:**
  - `'todos'` → `participants.focus = NULL`, `all_levels = true`;
  - a level → `participants.focus = <level>`, `all_levels = false`;
  - NULL (Sin indicar) → `participants.focus = NULL`, `all_levels = false`. **Boolean false, never SQL NULL.**
- **Create:** replay → `school_data_missing` → `roster_full` → `duplicate_rut` → insert the participant (funding copied, focus mapped) and its focus row.
- **Update:**
  1. `unknown_participant` → `stale_version`;
  2. **no-op** if names, RUT, passport, both dates, the **effective** focus, the dietary codes and the dietary detail are all identical. Funding, `notice_version` and `acknowledged_at` are not compared;
  3. `school_data_missing` → `duplicate_rut`;
  4. update all fields: funding re-copied, focus mapped, `acknowledged_at = now()`, `version + 1`;
  5. upsert the focus row.
- **Any real write** bumps the roster version and reopens a submitted roster. Replays and no-ops never touch the roster.

**Ordering:** a replay and a no-op both answer even when school funding is missing, so a coordinator retry never turns into an error. Funding is enforced on every real write.

### Finalize (C3)
- **App gate:** finalize stays `pasantias_intake_finalize`. Before calling it, the app looks up the live roster (401 if none), then reads the funding row and returns 422 `SCHOOL_DATA_MISSING` without calling the RPC if there is none.
- **Race-free:** the funding row cannot be deleted, and every funding change bumps the roster version, which finalize already compares. pgTAP 115 shows that a finalize carrying the version from before a funding change gets `stale_version`.

### Reads (app, service_role)
- **Participant lists** must **not** select `flights_funding` or `lodging_funding`. Read `pasantias_nomina_participant_focus` with `.in('participant_id', ids)`, using only ids that came from the roster-scoped participant list.
- **Every `roster` in a response** gets `schoolFunding`: `{flightsFunding, lodgingFunding, version}`, read from `pasantias_nomina_school_funding` by `roster_id`, or `null` when there is no row.
- **Admin lists:** fetch funding with one embed or one batched `.in()` query, with literal table names in `.from()`.
- **Never** select `token_hash`, as in DB-01.

## 7. Release precondition (C8)
Not executed here. For any environment other than local, this query must return 0 before release. Otherwise the release stops and PM asks Brent.

```sql
SELECT count(*) FROM public.pasantias_intake_participants p
 WHERE NOT EXISTS (SELECT 1 FROM public.pasantias_nomina_school_funding f WHERE f.roster_id = p.roster_id);
```

## 8. Known limits
1. **The old save function is still executable.** `pasantias_intake_save_participant` keeps its service_role EXECUTE grant, because 114 pins it. If it were called, it would accept per-person funding (breaking I1) and write no focus row. C2 depends on the app having **no** caller, proven by an app-side static scan. Nothing in the database blocks the call.
2. **I2 is maintained only by the RPC.** It isn't a CHECK, because it spans two tables and a trigger on the DB-01 table would break 114. Only `pasantias_nomina_save_participant` writes focus rows, and pgTAP 115 checks I2.
3. **Funding copies touch `updated_at`.** A funding copy changes the participants' `updated_at` without bumping their version. If the UI shows `updatedAt`, a funding change will look like a participant edit time.
4. **Finalize doesn't check funding.** The unchanged finalize checks for participants but not for school funding. The app's pre-check is the gate (FIRST §3.6).
5. **Old browser tabs.** A tab still running the old build sends funding keys and gets a 422 (FIRST N2), which fails safely.
6. **No real concurrency in pgTAP.** pgTAP is single-session. The races (competing first saves, a funding save racing a participant create, double clicks) belong to the app's Playwright `Promise.all` journeys.
7. **Hand-derived expectations.** pgTAP 115 assumes the same Postgres conventions as 114: PG ≥ 13 error wording, `public` on the test `search_path`, and `format('%s', bool)` giving `t`/`f`. The 114 run under r5 confirmed them.

## 9. pgTAP 115 coverage (`plan(140)`) and NOT_RUN
- **E1, structure (24):** exact columns and defaults, constraint sets, triggers. Every new constraint refused with its exact message, next to a valid base row. Funding NOT NULL with no default; `all_levels` NOT NULL with no default; both FKs; ON DELETE RESTRICT both ways; the DB-01 focus CHECK still refuses `todos`.
- **E2, access (20):** exact ACLs; plpgsql, VOLATILE, INVOKER, `search_path=''`; frozen signatures, no overloads; only the restrictive guard. A 12-operation matrix for anon, 12 personas and service_role.
- **E3, behaviour (96):**
  - **funding:** first save; replay with NULL, the current version and an arbitrary version; competing-first-save stale and wrong-version stale, each writing nothing; real change; two programs independent; 13 refusals plus a state snapshot;
  - **I1:** participants created before and after the funding save, versions unchanged;
  - **participants:** todos, level and NULL round trips (NULL → `all_levels false`); transitions Todos → level → Sin indicar → Todos; no-ops; replay with changed fields not applied; cross-roster request id; `school_data_missing` ordering (replay and no-op first, then school, before duplicate RUT; stale and unknown before school); 28 refusals plus a state snapshot;
  - **cap** of 60;
  - **finalize and reopen:** funding no-op after sending doesn't reopen; a funding change reopens and re-copies; the old finalize with the version from before the change gets `stale_version`; a level → Todos edit reopens;
  - **rotation;** and global checks of I1, I2 and focus-row presence.

**NOT_RUN:** the migration apply; pgTAP 115; pgTAP 114 (must stay 176/176); 001, 053, 112, 113 and the full `supabase test db`; `guard:migrations`; `guard:secrets`. Nothing has been executed. The plan count and every expected string were derived by hand.
