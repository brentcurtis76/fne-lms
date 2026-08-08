# CODEX REVIEW — A8 round 1 (final)

VERDICT: PASS

Phase A8 meets every acceptance criterion. Branch `phase/a8-leads-ui`, head `fd33706c`
(commits `2448322a` + `fd33706c`), base local `main` @ `5190344c`: the diff is exactly the ten
in-scope code/test files plus the ledger entry and the review request; `middleware.ts`,
`lib/pasantias/leads.ts`, `supabase/**` and `pages/api/admin/users.ts` are untouched, and no
dependency changed. I re-ran every gate myself on the final head and — the one thing neither
executor round nor the PM could do — executed the seeder's INSERT tuple against a live,
fully-migrated local Postgres inside a rolled-back transaction: it satisfies every constraint.
No BLOCKING finding. Two SHOULD-FIX items (both real, neither a criteria violation) and three
NITs, including my ruling on the two questions the PM referred to this round.

BLOCKING:

- None.

SHOULD-FIX:

- **S-01 — the PATCH transition check is read-then-write; a concurrent-admin interleaving can
  breach D-03, including `converted` terminality.** `handlePatch` reads the current status
  (`pages/api/admin/pasantia-leads/index.ts:220`), asks `canTransitionLead` (line 247), then
  updates by `id` alone (lines 262–267). Two sessions holding the same rendered row: A moves
  `contacted→converted` (legal); B, validated against the stale `contacted`, moves
  `contacted→dismissed` (legal per its read) — B's UPDATE lands on a now-`converted` row and
  applies `converted→dismissed`, which the graph forbids. The dropdown's legality filter and the
  in-flight `busy` disable narrow this to genuinely concurrent sessions, and A5 ledgered an
  accepted race of the same shape (LEDGER 2026-08-04, decision 3) — but that one's worst case
  was a duplicate courtesy mail; this one's is a D-03 invariant violation. The fix costs one
  line and no schema: add `.eq('status', current.status)` to the UPDATE and treat the resulting
  empty `maybeSingle()` as a conflict (today that null branch is dead code — no delete path
  exists — so it is free to mean 409 with a re-read `allowed` list). Non-blocking: the frozen
  criteria demand that every change pass `canTransitionLead`, which it does; they do not demand
  compare-and-swap atomicity, and the single-actor behaviour is fully tested.

- **S-02 — `sourcePathRepeatsUtm` structurally cannot fire for any UTM value containing a
  space, so the [A-new-2] annotation under-fires on the most realistic case.** The form decodes
  `utm_*` through `URLSearchParams.get()` (`components/pasantias/LeadForm.tsx:240–244`: `%20`
  and `+` become a space) while `source_path` stores `pathname + search` percent-encoded — and
  `sanitizeSourcePath` refuses any stored path containing literal whitespace. Therefore for
  `?utm_source=correo%20abril` the column holds `correo abril`, the path holds
  `correo%20abril`, and `path.includes(value)`
  (`components/admin/PasantiaLeadCard.tsx:109–116`) is false forever. No false claim is made —
  the note simply fails to appear, and the hard core of [A-new-2] (UTM columns are the
  attribution surface; the path is labelled browser-reported, shown verbatim, never framed as
  corroboration — tested at `pasantia-lead-card.test.tsx:185–199`) holds. Fix: parse the stored
  path's query with `URLSearchParams` and compare decoded values per key. That also kills the
  latent substring false-positive class (`utm_source: 'a'` matching `/pasantias`), which
  `includes` only avoids today because the real form always derives both fields from one URL.

NITS:

- **N-01 — `domPrefix` (ruling requested by the PM): the shipped shape is ACCEPTED.** The
  executor's argument for keeping both layouts mounted is sound on this project's stated
  hardware constraint, and the r2 guard is two-layered: source-pinned prefixes at both call
  sites plus a behavioural assertion that two prefixed mounts emit zero duplicate `id`s and
  that every `label.htmlFor` resolves to exactly one element
  (`pasantia-lead-card.test.tsx:235–280`). Making the prop required would not close the class —
  a future call site can pass `""` twice as easily as omitting it — so it buys a compile nudge,
  not the invariant. The structural close is `React.useId()` for the `id`/`htmlFor` pairs
  (unique per mount by construction), keeping `domPrefix` only for `data-testid`
  addressability. Recommend that refactor before B5 clones this card shape for contacts admin;
  it is not a defect in what shipped.

- **N-02 — both GET queries silently cap at PostgREST's `max_rows` (Supabase default 1000).**
  The list and the counts query (`index.ts:149–152`) carry no explicit range, so past 1000
  leads the tabs undercount and the list truncates with no pagination anywhere. Unreachable for
  a single-cohort interest table at today's scale; backlog a `count: 'exact', head: true`
  per-status count (or pagination) before this surface is reused for anything unbounded.

- **N-03 — the terminal-state card renders an orphaned `<label>`.** When
  `transitions.length === 0` the "Cambiar estado" label keeps `htmlFor={dom('lead-status')}`
  but the replacement div carries no id (`PasantiaLeadCard.tsx:244–256`). Screen-reader noise
  only; give the div the id or drop the `htmlFor` in that branch.

NOTES ON THE PHASE AND THE EVIDENCE:

- **Independent gate evidence, all re-run by me on `fd33706c` in `~/dev/wt-a8`:** targeted
  suites **43/43**; full `npm test` **265 files / 6242 tests**, all green; `type-check` clean;
  `lint` exit 0 with zero warnings; `lint:testid` reports nothing on any A8 file (the ~2.6k
  advisory findings are the pre-existing repo baseline); `npm run build` compiled and emitted
  both artifacts (`.next/server/pages/admin/pasantia-leads.js`,
  `.next/server/pages/api/admin/pasantia-leads.js`); `playwright test --list` collects the 3
  specs, which also executes `assertFixtureRosterComplete` at module load — the top-level
  `pasantiasLead` fixture key provably does not disturb the users-roster guard
  (`tests/e2e/helpers/auth.ts:79–96` inspects `fixtures.users` only).

- **The seeder INSERT has now met a live Postgres.** Method: against the running local stack
  (started by the concurrent A7a session — deliberately not reset, not raced), I first verified
  `\d public.pasantias_leads` matches the migration file exactly, then executed the
  byte-exact tuple `ensurePasantiasLead` sends (`scripts/ci/seed-e2e.mjs:186–219`, values from
  `e2e-fixtures.json`) inside `BEGIN … ROLLBACK`. Result: `INSERT 0 1`; the marketing tuple
  correctly rides the defaults (`false`/NULL/NULL satisfying the all-or-nothing CHECK); the
  `email_normalized = lower(btrim(email))` CHECK holds (fixture email is lowercase and
  whitespace-free, so the JS `trim().toLowerCase()` mirror is exact here); `num_people` 3 in
  [1,60]; `status` `new` legal; both consent NOT NULLs stamped; zero rows before, zero after
  rollback. The look-before-insert on the real UNIQUE `(email_normalized, cohort)` is genuinely
  idempotent and leaves an existing row's status untouched (a human's or a spec's triage
  survives re-seed); ordering in `main()` is safe — the lead has no FK into the persona/zoom
  graph and runs after it (`seed-e2e.mjs:291`), and any throw still exits 1 via `main().catch`.
  What remains CI-gate-4-only: the storage-state login bootstrap against the seeded stack, the
  page rendering against a real PostgREST, and the seeder's earlier persona/zoom passes — all
  pre-existing machinery that prior phases' gates have run.

- **Criteria, verified against the code rather than the ledger.** [A1]: GET filters
  `status` (unknown → 400, never a silent "all") and sanitized `search`; PATCH validates
  UUID-shaped `id`, enforces the graph via `canTransitionLead` with 400 + `allowed` derived
  from `LEAD_STATUSES.filter` (no second graph copy anywhere — the UI's dropdown derives
  through `allowedLeadTransitions` from the same frozen helper); 401 anon / 403 docente tested
  for both verbs. [A2]: all nine columns present in the desktop table, reachable on mobile via
  the card (r2's `Programa enviado` field); expand shows mensaje/utm/source/consent version;
  dropdown offers only legal moves; notes; CSV; es-CL; testids. [A3]: the 23 API tests assert
  at the Supabase boundary (filter expressions, exact update payloads — whitelist proven by the
  extra-key test, `updated_at` proven unwritten), the 20 component tests assert rendered DOM
  against hostile values; e2e in `MANDATORY_SPECS`, admin-sees-seeded-lead plus both denial
  directions (docente→`/dashboard` matches `middleware.ts:85`; anon→`/login?next=` matches
  `middleware.ts:21–26`). [A4]: above. [A-new-1]: hostile paths render as text; zero `<a>`,
  zero `href`, zero `dangerouslySetInnerHTML` in page and card (re-grepped); markup arrives
  escaped. [A-new-2]: met in structure and copy (S-02 notes the annotation's blind spot).
  [A-new-3]: satisfied in exactly the idiom the criterion itself prescribes — positive pins on
  the `lib/exportUtils` import and `ReportExporter.exportToCSV`, negative pins on
  `join(',')`/`new Blob(`/`text/csv`/`createObjectURL`; I confirmed `csvEscape` →
  `neutralizeSpreadsheetFormula` fires on that path and that the es-CL row keys equal the
  headers by construction (`Object.keys(exportRows[0] ?? EMPTY_EXPORT_ROW)`), which defuses
  `getNestedValue`'s headers-as-key-path trap; no header contains a `.`. [A-new-4]: hostile
  term test proves the `or=()` expression still splits into exactly the four intended filters;
  dropping `,()"\` is the right transform (escape-in-place is where `users.ts:295` went wrong);
  keeping `%`/`_` is a judgment call I ACCEPT — LIKE wildcards on a SELECT-only route, typed by
  the same admin who reads the result, can only widen a match within rows already readable;
  dropping `*` (PostgREST rewrites it to `%`) closes the invisible-wildcard case.

- **Frozen decisions hold.** D-03: one graph, enforced at the API boundary (S-01 is a timing
  gap in that enforcement, not a second authority). D-04: both verbs behind `checkIsAdmin`,
  writes only via the service-role client; no client-side write exists to attempt; RLS/grants
  untouched. D-10: zero `middleware.ts` changes; es-CL UI / English code; `getByRole`/
  `getByTestId` plus a `getByText` on the seeded institution — precedented in reviewed specs
  (`reservation.spec.ts:43`, `pasantias-page.spec.ts:120`) and disambiguated with `.first()`;
  no `waitForTimeout`. D-12: marketing shown `Sí` only from the stored boolean with its own
  timestamp; the seeder stamps required consent evidence explicitly and asserts nothing
  optional. Ley 21.719: the route logs error objects only (and the whitelisted UPDATE cannot
  reach a `Failing row contains` constraint detail); fixtures synthetic on RFC 2606 domains.

- **Mock fidelity, checked:** the suite's reproduced `handleMethodNotAllowed` matches the real
  one (Allow header + 405, `lib/api-auth.ts:258–263`); `checkIsAdmin`'s real return shapes
  match the three mock personas (anon → `error` set → 401; docente → `isAdmin:false` → 403);
  and the API guard chain (`checkIsAdmin` → `hasAdminPrivileges` → `isGlobalAdmin`,
  `utils/roleUtils.ts:158–161`) is literally the page's `getServerSideProps` predicate, so the
  two gates cannot drift.

- **r2's relabel is correct and complete.** `brochure_sent_at` is stamped only by the
  auto-reply that mails `BROCHURE_PATH` (`pages/api/pasantias/lead.ts:185`,
  `lib/pasantias/emails.ts:29`), the priced "programa completo"; the ficha remains the public
  price-free download (`pages/pasantias.tsx:709`). `Programa enviado` appears byte-identical in
  the table header, the export row key and `EMPTY_EXPORT_ROW`, pinned by the 3-occurrence
  source test; no capitalized "Ficha" survives anywhere in the repo's UI strings for this
  timestamp (re-grepped).

- **A9 friction: none.** `LEAD_COLUMNS` already exposes `brochure_sent_at` and both consent
  evidence fields through the admin GET — exactly the surface A9's evidence fix (R2-S-01)
  asserts through — and the e2e deliberately never triages the seeded lead, so A9 can reuse it
  in status `new`. The two SHOULD-FIXes above are also candidates to fold into whatever round
  carries A9's integration spec, if the PM prefers not to spend an A8 r3 on them.

Independent evidence summary, final head `fd33706c`: targeted 43/43 · full 6242/6242 in 265
files · type-check ✓ · lint 0 warnings ✓ · lint:testid clean on A8 files ✓ · build ✓ (both
artifacts emitted) · playwright --list 3/3 ✓ · seeder INSERT proven against live migrated
schema, rolled back traceless ✓. The e2e specs themselves remain unexecuted locally by all
three of us for the same good reason (the shared stack belongs to the live A7a session); with
the seeder tuple now proven against the real DDL, the residual gate-4 risk is confined to
plumbing every prior phase already exercises.

---

# CODEX REVIEW — A8 r3 targeted re-check

VERDICT: PASS

This verdict covers only `git diff fd33706c 0cb0cf58`. The original PASS at `fd33706c` remains
closed. The r3 compare-and-set closes S-01 in the required single-`.eq` shape; the decoded,
per-key UTM comparison closes S-02 without restoring either substring false positive; and the
terminal branch no longer emits a dangling `htmlFor`. No BLOCKING finding. One non-blocking API
contract issue should be resolved before any future client consumes the new conflict metadata;
it does not affect the current page, which reads only `error` on a 409 and tells the admin to
reload.

BLOCKING:

- None.

SHOULD-FIX:

- **R3-S-01 — the 409 field named `status` is not the current status, and D-07 does not make it
  one.** `pages/api/admin/pasantia-leads/index.ts:295–304` returns the failed guard value — the
  status read *before* the winning concurrent transition — under the unqualified name `status`.
  D-07's campaign rule is a semantic requirement (the body carries the campaign's current
  status), not a generic 409 response shape into which any status may be placed. The objection
  that a re-read is also racy does not change that: every returned row is a snapshot, while this
  value is known already to be superseded. Do not let a future client update its model or choose
  an action from this field. Before such a consumer exists, either omit it, rename it to
  `expected_status`/`guard_status`, or re-read and return the post-conflict row if the field must
  remain `status`. Non-blocking now because `pages/admin/pasantia-leads.tsx:119–128` ignores it
  and surfaces only the reload instruction.

RULINGS ON THE REFERRED QUESTIONS:

- **Notes-only PATCH guard: ACCEPTED.** This is a status compare-and-set, not full row-level
  optimistic locking: it prevents a note from landing when a status transition interleaves
  between this request's read and write, but it does not prevent note-vs-note last-write-wins or
  detect a stale browser view whose status changed before the server-side read. Within those
  precise limits, applying the same status precondition to the whole PATCH is a defensible,
  conservative granularity. The `converted` notes-only test is the right regression pin: it
  proves the guard is not accidentally narrowed to `hasStatus` and that terminality does not
  prohibit notes.

- **Nullable `currentStatus`: ACCEPTED WITH A NIT.** The live column is protected by both `NOT
  NULL` and the four-value CHECK, so `null` is not a reachable database state. Failing closed is
  the safe direction. If this route is hardened later, an explicit `isLeadStatus(currentStatus)`
  invariant check returning 500 would diagnose corruption or a malformed data double more
  honestly than the present 409 "cambió mientras lo editabas" response. This is not a defect in
  a reachable A8 path.

- **Fragment false negative: NOTE only.** The shipped form records
  `window.location.pathname + window.location.search`; `location.search` excludes the fragment,
  so `x#frag` cannot arise from the genuine browser capture path. A hand-crafted accepted
  `source_path` can still contain `#`, making the backlogged parser hardening legitimate, but it
  does not reopen this targeted diff.

EVIDENCE:

- Read the complete six-file diff and the binding D-03/D-04/D-07 decisions. `git diff --check
  fd33706c 0cb0cf58` is clean.
- Independently re-ran the two targeted suites at `0cb0cf58`: **56/56** (25 API + 31 component),
  both files green. Per the request, I did not duplicate the already-reported full suite,
  type-check, lint, lint:testid, or build runs.

Final r3 ruling: PASS, zero BLOCKING. The branch is mergeable; R3-S-01 is a forward-contract
cleanup, not a reason to re-plan A8 or spend a nonexistent r4.
