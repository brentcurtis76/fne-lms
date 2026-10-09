# Review request — PASANT-B001c (Brent's recorded corrections in the January candidate)

## Branch

`ws/pasant-as` at HEAD `fb12545a9877726caf23dd2e6196f3865a9c33fc`: selected baseline
`76349909621bc07a1c7ab8242cd3c3ececaed152` plus 4 accepted child commits (PASANT-01 and PASANT-03 work and ledger).
Commit count by this executor: 0 — the PM owns commits; the five files below are uncommitted at delivery.

## Objective and scope

Reconcile Brent's recorded answers of 2026-10-08 into the January contract candidate and an executable independent
correction oracle, and prepare a reviewable sign-off candidate (ledger PASANT-B001c, derived from B001; C001–C003 stay
on the parent). **Scope in:** the decision record, the candidate's `decided` block and §7–§8, the register rows the
answers resolve, the oracle, this request. **Scope out:** ratification, PLAN.md amendment, product/UI/cohort/API
changes, the A9 test port, brochure PDF changes or publishing. **B001 remains open**; this child cannot unlock B002.

## Files by risk

- Medium — `__tests__/lib/pasantias/january-contract.test.ts`: `checkDecisions` pins Brent's three messages
  (transcript time + text), the four answered fields, the brochure originals and a basis derived from Brent's words;
  `checkRegister` replaces two fixed register tests. All 41 fact pins, price/team-row checks and fact mutations kept.
- Medium — `docs/plan/pasantias-january-contract.md`: `pending` P-01..P-04 become `decided` (same IDs, decisions,
  fields, pages, anchors); §7 records designed upload and routes the "Mussons" file to the D-05 release; new §8.
- Medium — `docs/plan/evidence/pasant-january/b001-brent-decisions.md` (new): messages, decision matrix BD-00..BD-07,
  PM records (ACK, baseline, port).
- Low — `docs/plan/evidence/pasant-january/b001-contract-prerequisites.md`: R-02..R-05, R-07, R-12 DECIDED;
  R-13..R-15 new class PM RECORD; R-08, R-11 reworded and still UNRESOLVED; §2 updated.
- Low — this file.

## Test evidence

- `npx vitest run __tests__/lib/pasantias/january-contract.test.ts __tests__/lib/pasantias/january-source.test.ts __tests__/lib/pasantias-cohort.test.ts`
  → 3 files, 219 passed (contract 135, source 30, cohort 54), 0 skipped, default and `CI=1`; baseline 186 (contract 102).
- Red evidence: the new oracle run against the B001b candidate and register at HEAD fails 28 of 135 tests (answered
  fields still pending, answered rows UNRESOLVED, no ACK/selection records); 135/135 on this state (RUN `evidence/red-green`).
- `npx eslint --max-warnings=0` on the changed test → clean; `git diff --check` → clean.
- npm run type-check, npm run lint, npm test and npm run build stay required on the final cumulative parent B001
  state; they are deferred by the order for this nonactive evidence/test slice and never waived — not run here.

## Scrutinize

1. "Confirm it" → RPA (BD-04) is the recording interpreter's mapping; I kept it as `interpreted` and made the oracle
   derive the basis from whether Brent's words contain the topic word. Check that the derivation is not too lenient
   (for example "name" for P-01) and that the sign-off question surfaces the interpretation.
2. P-03 stays under DEC-08 for identity continuity, though DEC-08 also names whole-contract ratification. Check that
   recording "Same numbers for January" cannot be read as ratification (contract intro, §8, BD-07, R-11).
3. New register class PM RECORD for the receiver ACK, baseline and port: they are the PM's routine choices under
   plan rev 1 (order be973700), not Brent decisions. Check the class is not a back door for DECIDED.
4. Verbatim text comes from the order's transcript match (message 3 has double spaces); I did not reread the
   transcript. The oracle pins those strings; it cannot see the transcript itself.
5. Prior accepted files are pinned by SHA-256 in the test; a future deliberate amendment must update the pins.

## Known limitations

- Whole-contract approval NOT GIVEN; contract stays CANDIDATE — NOT RATIFIED — NOT ACTIVE. Brent's answers are
  recorded, not ratified.
- The designed brochure still spells "Mussons"; the corrected file, hash, object key and upload before the
  BROCHURE_VERSION deployment are the Brent-owned D-05 release (R-08). Production mail state (R-17) is unchanged.
- The A9 relevant-path port is selected but not executed. Snapshot checks are not original-PDF checks.
