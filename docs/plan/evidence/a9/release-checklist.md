# A9 — Track A release checklist

**Phase:** A9 — Track A release verification · round r1
**Branch:** `phase/a9-verify` · base `7c7059ff`
**Executed:** 2026-08-08, 19:54 UTC (`date: Sat, 08 Aug 2026 19:54:47 GMT` on the `/pasantias` response)
**Target:** `https://www.nuevaeducacion.org` — production, Vercel, auto-deployed from `main`.
A7a's merge (`2c47a834`) deployed 2026-08-08 16:31:47Z; the build answering these requests
reports `buildId=build-1786217125411`, `x-vercel-id: gru1::iad1::5bf4k-1786218887367-10803b08d338`.

Every row carries **PASS** with the evidence that proves it, **FAIL** with what was seen, or
**OWNER-RUN — PENDING** with the exact steps Brent performs. Nothing is blank and nothing is
PASS on inference.

**All production checks below are read-only GETs.** The lead form was deliberately *not*
submitted against production: a submission creates a real lead row and sends real mail. The
form → row path is proven instead by `tests/e2e/pasantias-flow.spec.ts` against CI's ephemeral
stack (§B, rows A2-7a–d), and its production counterpart is the owner-run row A2-11.

**One instrument warning, from A7a's close.** Grepping delivered HTML is the wrong tool for
anything behind state. The Directivos flipbook iframe on the homepage sits inside
`{showDirectivesFlipbook && (…)}`, so it is absent from server-rendered HTML until the button is
clicked and its absence from `curl` output means nothing. Rows that need a click are routed to a
browser or to the owner, never to a grep.

---

## A. Production surfaces — executed here, read-only

| # | Row | Result | Evidence |
|---|---|---|---|
| A2-1 | `/pasantias` is live and returns 200 | **PASS** | `curl -o … -w '%{http_code}' https://www.nuevaeducacion.org/pasantias` → `http_code=200 bytes=60410 content_type=text/html; charset=utf-8` |
| A2-2 | `/pasantias` renders the correct cohort dates | **PASS** | The delivered HTML contains `Octubre, 5 al 16 · 2026`, `9 días de visitas · 7 escuelas`, `Semana 1 — inmersión`, `Semana 2 — visitas`, and `Fiesta Nacional de España`. These match Appendix A and `lib/pasantias/cohort-public.ts` (`COHORT_WEEKS` = `2026-10-05→2026-10-09` and `2026-10-13→2026-10-16`, 9 visit days). |
| A2-3 | No retired cohort literal appears on `/pasantias` | **PASS** | `grep -c "Abril 2026"` → `0`; `grep -c "Noviembre 2026"` → `0`. (Both were on the homepage before A1; the page-level guard is `tests/e2e/pasantias-page.spec.ts`, the source-level one `__tests__/pages/pasantias-site-links.test.ts`.) |
| A2-4 | The ficha downloads and is a real PDF | **PASS** | `GET /api/pasantias/ficha` → `http_code=200 bytes=452722 type=application/pdf time=2.34s`; first bytes `%PDF-1.3`; `content-disposition: inline; filename="Ficha-Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v2.pdf"`; `cache-control: public, max-age=3600`. |
| A2-5 | The ficha carries the right dates and **no prices** (D-02) | **PASS** | `pdftotext` of the downloaded file contains `Octubre, 5 al 16 · 2026 · 9 días de visitas · 7 …` and `Fiesta Nacional de España, colegios cerrados`. A scan for `€`, `EUR`, `USD` and thousands-separated numerals returns one hit only — `RUT 65.166.503-5` in the `LEGAL_IDENTITY` footer, which is an identifier, not an amount. |
| A2-6 | The brochure link resolves and serves the priced document | **PASS** | `GET /api/pasantias/brochure` → `http_code=200 bytes=566882 type=application/pdf time=3.53s`; first bytes `%PDF-1.3`; `content-disposition: inline; filename="Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v5.pdf"`. Prices present as D-02 requires: `€2.500`, `€120`, `€70`. The URL is stable and public by owner decision (D-05: UI-gated but shareable). |
| A2-8 | The homepage card shows the correct single span | **PASS** | The delivered homepage HTML contains `Pasantías en Barcelona` and `Octubre, 5 al 16 · 2026`; `grep -c "Abril 2026"` → `0` and `grep -c "Noviembre 2026"` → `0`. This is the defect A1 was opened to fix (the card previously advertised a past April cohort and a wrong November one). |
| A2-10 | The share preview metadata a WhatsApp unfurl reads is present and resolvable | **PASS** *(metadata only — the unfurl itself is A2-9)* | `/pasantias` serves `og:title` = `Pasantías INSPIRA Barcelona · Octubre, 5 al 16 · 2026 \| Fundación Nueva Educación`, `og:description` naming 9 días / 7 escuelas, `og:url` = `https://nuevaeducacion.org/pasantias`, `og:image` = `https://nuevaeducacion.org/images/pasantias/bcn-skyline.jpg`, plus the `twitter:*` pair and `twitter:card=summary_large_image`. The image itself resolves: `http_code=200 bytes=1539868 type=image/jpeg`, 2400×1350 progressive JPEG. **See the size note under A2-9 before running it.** |

## B. CI-proven rows — the form → row path

| # | Row | Result | Evidence |
|---|---|---|---|
| A2-7a | A real browser submission persists a lead row with correct split-consent evidence | **PENDING CI — first execution is this branch's CI run** | `tests/e2e/pasantias-flow.spec.ts`, test 1. Unmocked end to end: the form is filled and submitted on `/pasantias`, then the row is read back through `GET /api/admin/pasantia-leads` as the admin fixture (D-04: the table grants no authenticated write, and the public POST answers `200 {"success":true}` on both the insert and the update path, so it cannot be the evidence). Asserts `status='new'`, `cohort='octubre-2026'`, `consent_accepted_at` parseable, `consent_notice_version === PRIVACY_NOTICE_VERSION`, `marketing_opt_in === false` with `marketing_opt_in_at === null`, and `brochure_sent_at === null`. **This spec has not been run locally** — see §D. |
| A2-7b | The optional marketing opt-in is recorded only when clicked | **PENDING CI** | Same spec, test 2: a second unique address with the box ticked → `marketing_opt_in === true`, `marketing_opt_in_at` non-null and parseable. Tests 1 and 2 together are the only place both branches of D-12 are proven against a real row. |
| A2-7c | The auto-reply claim is released rather than left standing when no mail can go out | **PENDING CI** | Same spec, test 1, `brochure_sent_at === null`. CI has no `RESEND_API_KEY` (the string appears nowhere in `.github/workflows/ci.yml`), so `sendLeadAutoReply` returns `{sent:false, failure:'not_configured'}`, `canReleaseAutoReplyClaim` is true, and `runAutoReply` restores the previous value. `lib/pasantias/emails.ts` states the intent in prose — a missing key must not silently mark a lead "brochure sent" for a day when nobody was mailed — and this is the first time that sentence executes end to end. |
| A2-7d | A9's spec leaves A8's seeded fixture exactly as seeded | **PENDING CI** | Same spec, test 3: `status` and `consent_notice_version` of `fixtures.pasantiasLead` still equal the values in `scripts/ci/e2e-fixtures.json`, read from the JSON rather than retyped. |
| A2-4/6 (CI) | Ficha and brochure serve real PDFs from a cold cache | **PENDING CI** | Same spec, test 4: unauthenticated GETs on both routes assert `200`, `content-type: application/pdf`, and a body beginning `%PDF`. This is the CI-side counterpart to A2-4 and A2-6 above, which were executed against production. |

All five are registered in `MANDATORY_SPECS` (`scripts/ci/e2e-mandatory.mjs`), so CI's anti-skip
guard fails the job if the spec is absent from the report or any of its tests is skipped.

## C. OWNER-RUN — PENDING

These need a real mailbox, a real handset, or production credentials that an executor must not
use. Each states exactly what Brent does and exactly what to record.

### A2-9 — WhatsApp share unfurl on a named device

**OWNER-RUN — PENDING.**

1. On a phone, open WhatsApp and pick any chat (your own "Message yourself" chat is enough — do
   not send this to a client).
2. Paste `https://www.nuevaeducacion.org/pasantias` and wait for the preview card to render
   **before** sending.
3. Record, in this file: **device model**, **OS version**, **WhatsApp version**, and what
   appeared — title, description, and whether the **image** rendered or only text.

**Why this cannot be inferred from A2-10.** The tags are correct and the image resolves, but
WhatsApp fetches previews through its own crawler with its own budget. The `og:image` here is
**1.5 MB / 2400×1350**, which is well above the few-hundred-KB range WhatsApp is commonly
observed to render, so the plausible failure is a card with correct text and **no image**. That
is the specific thing to look for. If the image does not appear, record it as a FAIL here — it
is a finding for a follow-up round, not something A9 fixes (A9 changes no product code).

### A2-11 — The auto-reply arrives at a test mailbox

**OWNER-RUN — PENDING.**

1. From a browser, open `https://www.nuevaeducacion.org/pasantias` and submit the form using a
   **mailbox you control** — never a real prospect's address, and never a colleague's.
   Fill Nombre, Apellido, Email, Institución (use an obviously synthetic institution such as
   `Prueba interna FNE`), tick the processing-consent box, and leave the marketing box unticked.
2. Record: the **timestamp** of the submission, the **address used**, and the **institution
   string**, so the resulting row can be found and triaged afterwards.
3. In that mailbox, record whether the auto-reply arrived, **how long it took**, the **From**
   address it came from, and the **subject line**.
4. In `/admin/pasantia-leads`, find the lead by that address and record its **Programa enviado**
   value (the UI label for `brochure_sent_at`). With `RESEND_API_KEY` configured in production it
   should be **stamped**, which is the opposite of the CI case in A2-7c and is the point of
   running it here.
5. Triage the lead to `dismissed` when finished, so the production table is not left carrying a
   test row in `new`.

### A2-12 — The internal notification arrives

**OWNER-RUN — PENDING.** Part of the same submission as A2-11.

Record whether the internal notification arrived at the configured FNE address, its **subject**,
and whether the body carries the four fields an FNE reader needs to act (nombre, email,
institución, mensaje). If it did not arrive, record that — the two messages are sent
independently and one can fail without the other.

### A2-13 — The brochure link *inside the received email* works

**OWNER-RUN — PENDING.** Part of the same submission as A2-11.

Open the auto-reply on the device it arrived on, click the brochure link, and record the **URL
it resolved to** and whether a PDF opened. This is not covered by A2-6: that check requested a
known-good path directly, whereas this one exercises `buildBrochureUrl()` → `buildAbsoluteUrl()`
against production's configured origin. A wrong `NEXT_PUBLIC_BASE_URL` would produce a message
that looks perfect and links nowhere, and only this row would catch it.

---

## D. How the e2e spec was executed — stated plainly

**`tests/e2e/pasantias-flow.spec.ts` was not run locally. Its CI run on `phase/a9-verify` is its
first execution.**

Local Playwright runs `npm run dev:unsafe`, which loads `.env.local`, which points at the real
shared GENERA Supabase project. This spec POSTs leads, so a local run would write synthetic rows
straight into the production leads table — the thing `CLAUDE.md` forbids outright.

The prompt's second option, a local ephemeral stack, was checked and is **excluded by its own
precondition**: a local Supabase stack is already running for another worktree (11 containers on
the shared project ref `sxlogxqzmarhqsblxmtj` — all worktrees of this repo share
`supabase/config.toml` and therefore the same containers). `supabase db reset` plus a re-seed
would have destroyed that session's state.

Everything else in the gate set **was** run locally and is quoted verbatim in the executor
report: `type-check`, `lint`, `npm test` (266 files / 6263 tests), `npm run build`,
`node scripts/check-price-leak.mjs`, and the two [A-new-5] mutation proofs.

## E. Status of this checklist

Per [A3], the phase closes only when the checklist is fully green. It is not green yet:

- **8 rows PASS** (A2-1 to A2-6, A2-8, A2-10 — executed here against production).
- **5 rows PENDING CI** (A2-7a to A2-7d and the CI counterpart of A2-4/6) — they turn green with
  the CI run on this branch's PR, and red is a finding, not something to weaken the assertion for.
- **4 rows OWNER-RUN — PENDING** (A2-9, A2-11, A2-12, A2-13).

Pending owner rows are the expected end state of round r1 and are not a defect in it.
