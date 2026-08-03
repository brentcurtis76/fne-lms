# CODEX REVIEW — A1 round 3 (scoped r5 confirmation)

VERDICT: PASS

The owner-authorized r5 delta at `992aeef` is correct at the final reviewed
branch head `fa9ab38` (the code commit plus the PM's last-ledger-entry
verification). The optional extension is absent from both cohort modules and
the leak scanner, its absence is protected by a non-vacuous module-namespace
guard, and the commercial lodging note carries the approved base-doble
precision. No r5-introduced finding exists and there is no SOP §1.5 residue for
Brent.

BLOCKING:

- None.

SHOULD-FIX:

- None introduced by r5. The pre-existing S1 importer-allowlist and S2 rendered
  homepage-card items remain in the phase backlog and were not reopened by this
  scoped confirmation.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- **Madrid purge confirmed** — case-insensitive source greps return zero matches
  across `lib/pasantias/cohort-public.ts`,
  `lib/pasantias/cohort-commercial.ts`, and `scripts/check-price-leak.mjs`.
  The public aggregate ends without an extension field at
  `lib/pasantias/cohort-public.ts:309-328`; the commercial aggregate likewise
  has no extension field at `lib/pasantias/cohort-commercial.ts:99-112`; and the
  scanner's live fixed-amount list is now only the programme's `1.000`/`1e3`
  forms at `scripts/check-price-leak.mjs:58-72`. The scanner comment records why
  the retired `810` pattern left the live list; that historical comment is not a
  runtime pattern or cohort value.
- **No-return guard confirmed and non-vacuous** —
  `__tests__/lib/pasantias-cohort.test.ts:425-451` enumerates both complete
  runtime module namespaces, rejects matching export names, and serializes
  values plus function bodies before applying `/madrid/i`. I independently
  repeated the executor's mutation: adding a synthetic
  `COHORT_MADRID_MUTATION` export to the public module made the targeted suite
  fail at line 443 with `expected [ 'COHORT_MADRID_MUTATION' ] to deeply equal
  []`. After reverting the mutation, the two targeted files returned to **52/52
  passed** and the worktree was clean.
- **Deviation 1 accepted** — the prompt's literal-empty-grep criterion conflicts
  with its required `/madrid/i` no-return guard. The production source targets
  are literally clean; the scoped test surface contains exactly the guard's own
  prohibition regex at `__tests__/lib/pasantias-cohort.test.ts:433`. Keeping the
  mechanical guard is the correct interpretation and creates no residue.
- **Base-doble precision confirmed** — the note at
  `lib/pasantias/cohort-commercial.ts:53-61` remains derived from the `70`/`120`
  band and renders the approved A-7/A-8 clause exactly as dispatched: “por
  persona por noche, en base a habitación doble — el monto es por persona, no
  por habitación — según el tipo de alojamiento.” This matches the normative
  `origin/main` Appendix A-7 wording and the A-8 owner precision dated
  2026-08-02.
- The full note is pinned exactly at
  `__tests__/lib/pasantias-cohort.test.ts:367-385` and again in the scanner test
  at `__tests__/scripts/check-price-leak.test.ts:51-59`. The scanner adds the
  live `en base a habitación doble` alternative at
  `scripts/check-price-leak.mjs:132-143`; an independent isolated probe of that
  fragment fired `commercial-copy`. Every other surviving alternative on that
  line is also a substring of a current exported commercial string (lodging
  note, validity, payment terms, or brochure filename).
- **Head gates green** — independently run at `fa9ab38`: `npm run type-check`
  passed; `npm run lint` passed with zero warnings; `npm test` passed **234/234
  files and 3497/3497 tests**; `npm run build` completed; and
  `node scripts/check-price-leak.mjs` reported **266 client files scanned, no
  commercial data found**. The targeted cohort/scanner run separately passed
  **2 files, 52/52 tests**.
- Review scope was limited to the r5 delta and its final PM ledger entry. The
  diff from the previously passed A1 head changes only the stated cohort data,
  guard tests/scanner, review request, and ledger; no earlier A1 finding was
  reopened and no unrelated issue was considered.

There is no numbered residue for Brent under SOP §1.5.
