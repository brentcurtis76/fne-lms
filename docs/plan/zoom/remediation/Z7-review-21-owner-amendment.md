# Z7 Round 21 — binding owner amendment (Brent, 2026-08-14)

## Governing decision

Interpreter-level completeness of the custom JavaScript analyzer in
`__tests__/lib/services/ledger-hours-reader-inventory.test.ts` is **no longer a Z7 release
gate**. The analyzer must not continue to grow toward a general JavaScript interpreter in order
to satisfy synthetic runtime-oracle probes.

This amendment does not rewrite or delete `docs/plan/zoom/remediation/Z7-review-21.md`. That
contract remains the immutable record of the independent reviewer's Round 21 findings; this
artifact records the owner's decision about which of its acceptance criteria remain binding and
in what amended form.

## Amended assurance boundary

The required assurance boundary for the executable production inventory is now:

1. **Mechanically complete coverage of actual production consumers** — every production
   TypeScript, TSX, JavaScript, JSX, SQL, view, function, and RPC billing consumer is discovered
   from the real production roots and explicitly classified, with zero unexplained consumers.
2. **A maintainable TypeScript compiler/AST and module-resolution approach where practical** —
   the analyzer remains AST-driven on the TypeScript compiler API; its guarantees are bounded
   and stated rather than derived from open-ended runtime interpretation.
3. **Conservative, deterministic fail-closed handling** when unsupported syntax in a
   production-relevant location may carry database or ledger authority: such a site must
   produce exactly one deterministic unsupported result per site, never a silent zero.
4. **Exact production path/reader/writer/SQL/RPC inventories** remain mandatory and exact.
5. **All product/database/security controls remain mandatory**: database privileges, audited
   RPC boundaries, real writer tests, financial invariants, RLS, concurrency, lifecycle,
   attendance, availability, pagination, and billing controls.
6. **Synthetic language cases unrelated to actual production forms do not require full runtime
   interpretation.** Runtime-oracle equality on such probes is explicitly not a gate; the gate
   is the fail-closed guarantee above.

## How Round 21's five categories resolve under the amended boundary

For each category the questions are: does the form exist in production; are supported
production forms discovered correctly; do unsupported production-relevant forms fail closed
exactly once. The mechanical production hazard census
(`R21 census: production ledger-authority code carries no unmodeled hazard forms`) proves the
production-existence answers; the Round 21 probe suite proves the fail-closed behavior.

| Category | Production existence | Amended resolution |
|---|---|---|
| Z7-R21.1 call reachability | No dormant ledger-bearing declarations outside the classified census; no abrupt-module consumers | Dormant declarations remain **in** the census (conservative declaration-level reporting, deliberately not call-driven). An engine-claimed abrupt local module no longer silently discharges downstream ledger sites: they fail closed exactly once. |
| Z7-R21.2 switch scope | Zero switch statements with lexical clause bindings in ledger-authority files | Cross-clause bindings fail closed exactly once with zero fabricated exact calls (unchanged behavior, now pinned). |
| Z7-R21.3 Reflect operations | Zero `Reflect.*` in any production root | Modeled Reflect forms keep their exact prior-round semantics. Unmodeled forms either over-report a source-present ledger literal (conservative census direction) or fail closed exactly once; a pruned recovery region carrying ledger authority can no longer be silently discharged. |
| Z7-R21.4 inherited indices / comparators | Zero `Object.setPrototypeOf` in production; four UI/report `sort` comparators, all in files whose ledger touches are classified and green under the no-unsupported production gate | A callee resolving to no callable interpretation while naming the ledger fails closed exactly once. Comparator hazards fail closed once per distinct hazard site while the exact runtime call remains surfaced. |
| Z7-R21.5 symbol keys | One `Symbol` sentinel in `pages/api/zoom/webhook.ts`, a file with no ledger authority | Symbol identity is not modeled and is not required to be; each symbol hazard site fails closed exactly once with zero fabricated exact calls. |

## Mechanism

The analyzer gained a bounded **hazard net** instead of more interpretation:

- Every reached call expression is recorded. Inside hazard territory — `Reflect.*`,
  `Object.setPrototypeOf`, `Symbol` usage, or an engine-claimed abrupt local module — the
  evaluator's own claims of unreachability or uncallability are no longer trusted to discharge
  ledger authority:
  - a reached call whose callee resolves to no callable interpretation while naming
    `contract_hours_ledger` fails closed with one `unresolved ledger authority` result;
  - a never-reached call site naming `contract_hours_ledger` (a pruned catch region, code after
    an engine-claimed abrupt `require`) fails closed with one such result per site.
- Outside hazard territory the evaluator's exact modeling remains authoritative and every
  prior-round semantics is byte-identical.

Three pre-existing synthetic probe expectations changed direction as a documented consequence —
in each the exact census is unchanged and a conservative fail-closed marker was added where the
engine previously discharged a ledger site silently (two abrupt-module probes, one
Reflect-pruned branch probe). No product, database, security, or financial test changed.

## Fail-on-old evidence

Measured at the rejected behavior (HEAD `8f4f785e`, tree `6b94efd7`, before this round's code):
the conditional-module probe, the throwing-setter Reflect probe, and the inherited-index probe
all returned **zero exact and zero unsupported** — silent misses. Under this round's net each
returns exactly one deterministic `unresolved ledger authority` result, so the new Round 21
assertions fail on the rejected head. The dormant, switch, construct, comparator, and symbol
probes pin their conservative shapes with in-test runtime oracles.

## Status

R19, R20, and R21 remain provisional and pending independent review. Nothing in this amendment
accepts, merges, deploys, or production-verifies any part of Z7.
