# CODEX SOL — SECOND REVIEW, INSPIRA phase A6b (LeadForm)

Branch **`phase/a6b-form`**, head **`b5f609d0`**, base `main` @ `6a69e673`.
Checkout `~/dev/fne-lms`. Not pushed — no remote copy.

Your first review is on the branch at `docs/plan/reviews/REVIEW-A6B.md`. This is
**Codex round 2 of max 2** for this phase.

**You have final say on BLOCKING items.** Round caps on *executor* rounds are retired
(PLAN Decision Log, 2026-08-06) — classify honestly.

---

## What r2 did with your B1

The remediation commit is **`20daf432`** — one commit, +66/−14 on the component. Nothing
else in the form changed.

**Your finding was accepted whole, and the PM found a second instance of the same class
underneath it before staging the round.** `utm_*` was not special: the defect was that the
component could hold errors it had no way to show. Enumerating the validator's keys against
the rendered controls turned up **`cohort`**, reachable from the server on exactly the path
`lib/pasantias/leads.ts` describes — a cached page from a retired cohort passes client
validation against its own stale constant, posts, and receives `400 {fields:{cohort:…}}`
into a branch that rendered nothing and focused nothing. The same dead form you reported,
by a different door.

So r2 shipped three things rather than a patch for one field:

1. **`usableUtm()`** drops an over-cap `utm_*` value at read time. Not truncated — A5's
   ratified `sanitizeSourcePath` rule ("losing one lead's attribution is the cheap failure;
   losing the lead is not", LEDGER A5 r2) applied client-side. Each of the three values is
   judged on its own.
2. **`applyFieldErrors()`** is now the only path field errors take, from client validation
   and from a 400 alike. `RENDERED_ERROR_FIELDS` is a **whitelist**: any key outside it
   also raises a form-level message (`UNRENDERABLE_ERROR`, a distinct es-CL sentence whose
   remedy is *recargar la página*, because that is the actual remedy for the stale-cohort
   case).
3. **Your S1**: `payload.error || GENERIC_ERROR` became `GENERIC_ERROR`. The 400 `fields`
   payload is the only server copy the component still renders.

**No frozen file was touched.** The `maxLength` textarea is exactly as r1 left it, pending
the owner decision your NOTES asked for.

## What the PM verified, so you can spend your round elsewhere

Gates re-run by the PM: `type-check` clean · `lint` clean · `npm test` **263 files /
6199 tests** · `build` · `check-price-leak` OK over 267 files · `CI=1 npx playwright test`
over the three local specs — **21 passed, axe green**. Full diff read.

**The new guard was attacked, not trusted** — three mutants, all killed:

- **Neutralise the fallback** (`hasUnrenderableError` → `return false`): **6 tests fail**,
  the enumeration naming the key — *"an error keyed `cohort` is rendered nowhere: no
  control shows it and the form-level fallback did not fire"*.
- **Neutralise the drop** (`usableUtm` → `return value`): **2 tests fail**, both B1 cases.
- **The realistic future regression** — someone "tidies" `cohort` into
  `RENDERED_ERROR_FIELDS` without giving it a control: **2 tests fail**. The whitelist
  cannot be widened silently.

Source restored after each; tree clean.

The PM also checked the one judgment call that could have been wrong on its own terms:
`usableUtm` measures `normalizeText(value).length` but posts the raw value. That is
correct rather than sloppy — the route measures the same normalized length
(`optionalText` → `normalizeText` → cap), so client and server agree exactly, and
measuring the raw length would have dropped values the server would have accepted.

## What is deliberately still open

- **The server half of your B1.** `lib/pasantias/leads.ts` still 400s on an over-cap
  `utm_*` value that no form can render — the opposite of what the same module does for
  `source_path`, on reasoning that should have covered both. It is a **frozen A5 file**, so
  r2 was explicitly forbidden from touching it; A6b fixes this for its own client only and
  the next client of that route inherits the trap. The PM has logged it as a plan-level
  item for a later phase. **If you think A6b cannot pass while that remains, say so** — it
  is a defensible position and the PM would rather hear it now than at A7b.
- **`maxLength` on the message textarea**, pending the owner's ruling on your NOTES.
- The `docs(z2)` commits in this branch's history (now four) are a concurrent ZOOM
  session committing into a shared checkout. Docs-only, touching nothing A6b touches, being
  handled as merge hygiene. Not yours to rule on.

---

## Check

1. Is B1 actually closed, at the browser level and not just in unit tests? The pinned
   reproduction is `tests/e2e/pasantias-form.spec.ts` — *"an over-limit utm_source costs the
   attribution, never the lead"*.
2. Is the **class** closed, or only the two instances? `RENDERED_ERROR_FIELDS` is a
   whitelist and therefore fails safe for an unknown key — but the enumeration that polices
   it derives its key list from `LEAD_VALIDATION_MESSAGES` and `LEAD_FIELD_LIMITS`, not from
   the validator's behaviour. A future validator key living in neither module would be
   unenumerated. The PM's position is that this costs nothing because the whitelist fails
   safe. **Test that position rather than accepting it.**
3. Is `UNRENDERABLE_ERROR` the right answer for a visitor, or does it strand them
   differently — a message they cannot act on? Reloading genuinely fixes the stale-cohort
   case; it fixes nothing if the cause is something else.
4. Does S1's fix lose anything real? The route's 429 previously surfaced its own
   rate-limit sentence and now shows the generic one.
5. Regressions: all 11 r1 RTL tests and all 6 r1 e2e tests pass **unmodified** — the
   executor reports changing no existing test. Verify that.
6. D-12, D-02, D-01 still hold. A6r guard 42/42 with `EXPECTED_RESTATEMENTS` unedited.
7. Anything that makes A7a or A8 harder.

**Known limit, stated rather than discovered:** the full `MANDATORY_SPECS` list cannot run
on this machine — `ci-fixture`, `zoom-*` and `session-*` need the seeded ephemeral Supabase
stack CI builds. The three local specs are the standard this phase has run under since r1.

Review against the plan's contract, not your own preferences. Taste disagreements are
NITs. Only correctness, contract violations, security and architectural violations are
BLOCKING.

Output using the CODEX REVIEW format, and write it to
`docs/plan/reviews/REVIEW-A6B-R2.md`:

```
## CODEX REVIEW — A6b round 2
VERDICT: PASS | FAIL
BLOCKING:
- [B1] <finding> — <file:line> — <why it blocks>
SHOULD-FIX:
- [S1] ...
NITS:
- [N1] ...
NOTES ON THE PLAN ITSELF: <if the plan, not the code, is the problem>
```
