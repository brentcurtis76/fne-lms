# Review request — CONTACT-BOTS (bot screening on the public forms)

**Status (2026-11-11): built and checked locally on `fix/contact-bots`; Brent asked for the release the same day. Push, PR and merge are his; nothing is in Production until he merges.**
Done by one Claude session at Brent's request, outside the PM–Executor workflow.

## Branch and base

- Branch `fix/contact-bots`, cut from `main` at `cef7e8e5c` (merge of PR #174). Two commits: the fix, then the release bookkeeping (Vercel previews disabled for the branch in `vercel.json`, status lines).
- No migration, no new table, no new environment variable, no outside service.

## Objective

The homepage contact form (`pages/index.tsx` → `pages/api/contact.ts` → mail to `info@nuevaeducacion.org`) delivered 23 bot messages in 60 days and one real one. Every bot message had the same shape: random mixed-case letters as Nombre and Institución, a Gmail address with scattered dots, the first Interés option, Cargo empty. They arrive one at a time, hours apart, so the existing 5-per-minute limit never fires.

Stop those, without ever losing a real message: a real one is rare and worth far more than a bot is annoying.

**In scope:** one pure screening module; the contact route and form; the Pasantías lead route, form and internal notification; the shared signup handler (`/api/tractor-signup`, `/api/registro-signup`); tests.
**Out of scope:** any outside service (Turnstile and the like), any database change, the two signup pages' markup, the admin surfaces, Production.

## What it does

`lib/formSpamGuard.ts` scores a submission. Strong signs are worth 2, weak signs 1.

| Sign | Weight |
|---|---|
| The hidden trap field was filled | strong |
| Sent less than 3 seconds after the form appeared | strong |
| A typed field is random letters (one per field) | strong |
| The form's timing mark is missing (a direct POST — or a page cached from before this shipped) | weak |
| Gmail address with three or more dots before the `@` | weak |

- **3 or more → refused.** HTTP 422 with a visible message that names another way to reach FNE. Never a fake success.
- **Exactly 2 → delivered, marked.** The subject gains `[POSIBLE SPAM]` and the body lists the reasons.
- **0 or 1 → delivered untouched.**

"Random letters" needs both of two independent properties in one word of ten or more Latin letters: capitals scattered mid-word, and no vowel rhythm. A free-text message counts only when every word in it is random.

Per form:

| Form | Refuse | Mark | Notes |
|---|---|---|---|
| Homepage contact | yes | yes, in the mail to `info@` | New trap field and timing in `pages/index.tsx`. A refusal is logged with name, address and institution, as a delivered message already is. |
| Pasantías lead | yes | yes, in FNE's notification | Timing added to `LeadForm`. Runs after validation and before any read or write, so a refused lead stores nothing and mails nobody. The existing trap-field path (fake success, nothing stored) is unchanged. Refusals log signals only. |
| Signups (both) | yes | no | Typed fields and address only; no timing. There is nowhere to put a mark, and every signup already waits for an admin. The existing trap-field path is unchanged. Refusals log signals only. |

## Files, by risk

**Highest — decides whether a message is delivered**
- `lib/formSpamGuard.ts` (new) — the rules and thresholds.
- `pages/api/contact.ts` — refuse / mark / deliver.

**High — live forms that store data**
- `pages/api/pasantias/lead.ts` — the check and the 422; `possibleSpamReasons` passed to both write paths.
- `lib/signupSubmission.ts` — the refuse-only check.
- `lib/pasantias/emails.ts` — subject tag and notice in the internal notification.

**Lower — what the browser sends**
- `pages/index.tsx` — trap field (off-screen, not first in the form), elapsed time.
- `components/pasantias/LeadForm.tsx`, `lib/pasantias/leads.ts` — `elapsedMs` in the body and its type.

**Tests**
- New: `__tests__/lib/formSpamGuard.test.ts`, `__tests__/pages/home-contact-form.test.tsx`.
- Extended: `__tests__/api/contact.test.ts`, `__tests__/api/pasantias-lead.test.ts`, `__tests__/api/registro-signup.test.ts`, `__tests__/lib/pasantias-emails.test.ts`, `__tests__/components/PasantiasLeadForm.test.tsx`.

## Test evidence

On the final code: `type-check` PASS; `lint` PASS (zero warnings); Vitest full run 549 files, 18 322 passed, 12 skipped (older skips), 0 failed; the 19 files that touch these forms 6 722 / 6 722; `guard:browser`, `guard:secrets`, `guard:migrations` PASS; `build` PASS with placeholder local Supabase settings (the working copy has no `.env.local`).

New and extended suites: `formSpamGuard.test.ts` (84), `home-contact-form.test.tsx` (5), `contact.test.ts` (36, 13 new), `pasantias-lead.test.ts` (115, 11 new), `registro-signup.test.ts` (29, 4 new), `pasantias-emails.test.ts` (39, 2 new), `PasantiasLeadForm.test.tsx` (49, 1 new). Not run: pgTAP (no database change) and Playwright e2e (it needs the Supabase stack, which this session was told not to touch). The four e2e specs that drive these forms (`pasantias-form`, `pasantias-flow`, `registro`, `auth-lifecycle`) were read instead: none asserts an exact posted body or a notification subject, and none uses a fixture that scores 3.

## Where to look hardest

1. **False positives in `isRandomLetterToken`.** The thresholds come from a simulation (about 98% of uniform random 23-letter strings match) and a hand-written list of awkward real names, not from real traffic. A run-together English or German name (`StMargaretsBritishSchool`) does match; on its own that only marks the message.
2. **The visible refusal instead of a fake success.** Chosen so a wrongly refused person can tell. It also tells a bot it was refused; these bots do not read responses, but a targeted one would.
3. **`elapsedMs` is reported by the browser.** A script can send any number. It is one sign among several, never trusted alone, and its absence is deliberately weak so a cached page still gets through.
4. **Fast automated submissions.** Anything that fills a form in under 3 seconds — including this repo's own Playwright runs against the lead form — now scores 2 and is marked, not refused. No e2e asserts on the notification subject today.
5. **The trap field alone is not refused on the contact form**, unlike the three older forms, which keep their fake success. The two behaviours differ on purpose (browser autofill can fill a hidden field), but they do differ.

## Known limits and deferred items

- The repository is public, so the rules are readable. Fine against spray bots; not a defence against someone targeting FNE.
- Bots that type plausible names, wait, and skip the trap field pass. That is the point at which an outside challenge (Turnstile) would be worth raising with Brent.
- No counter or dashboard: refusals are only in the server log (`[contact] submission refused as automated`).
- The two signup pages do not send timing. Adding it is a small follow-up if junk signups ever appear.
- `npm run lint:testid` was not made blocking; the one new input carries `data-testid="contact-website"`.
