# PASANT-B001a — A9 Git snapshot

Provenance snapshot of the pinned A9 graph and the exact A9 lines B001 must preserve, committed so repository tests
work in a shallow or fresh checkout. **Snapshot checks are not Git checks**: `january-source.test.ts` validates this
file's internal integrity (per-extract SHA-256) and the reconciliation register against it; only the PASANT-01 RUN
validator (`RUN/evidence/validate-original-source.mjs`) compares the graph, blob IDs and every extract line with the
real Git objects. Extracts are verbatim lines selected by row ID; `blob` is the Git object ID of the whole file at
`commit`. Observed 2026-10-08 after `git fetch origin main phase/a9-verify` (refs unchanged).

```json
{
  "graph": {
    "main": "76349909621bc07a1c7ab8242cd3c3ececaed152",
    "a9": "9008bacddcf40a79aa4c051b11ab3a5baf33939b",
    "mergeBase": "7c7059ffbf51b072cd38b00f5445e3ae972640c8",
    "leftRightCount": "601\t19"
  },
  "extracts": [
    {
      "commit": "9008bacddcf40a79aa4c051b11ab3a5baf33939b",
      "path": "docs/plan/evidence/a9/release-checklist.md",
      "blob": "55f860a10d88998bd2b286e33a5a915a760afb95",
      "sha256": "2dd233bcb23111a019bd30b3eefc82e1a2d664ced798e3a1d8a3231b9b22a778",
      "lines": [
        "| A2-1 | `/pasantias` is live and returns 200 | **PASS** | `curl -o … -w '%{http_code}' https://www.nuevaeducacion.org/pasantias` → `http_code=200 bytes=60410 content_type=text/html; charset=utf-8` |",
        "| A2-2 | `/pasantias` renders the correct cohort dates | **PASS** | The delivered HTML contains `Octubre, 5 al 16 · 2026`, `9 días de visitas · 7 escuelas`, `Semana 1 — inmersión`, `Semana 2 — visitas`, and `Fiesta Nacional de España`. These match Appendix A and `lib/pasantias/cohort-public.ts` (`COHORT_WEEKS` = `2026-10-05→2026-10-09` and `2026-10-13→2026-10-16`, 9 visit days). |",
        "| A2-3 | No retired cohort literal appears on `/pasantias` | **PASS** | `grep -c \"Abril 2026\"` → `0`; `grep -c \"Noviembre 2026\"` → `0`. (Both were on the homepage before A1; the page-level guard is `tests/e2e/pasantias-page.spec.ts`, the source-level one `__tests__/pages/pasantias-site-links.test.ts`.) |",
        "| A2-4 | The ficha downloads and is a real PDF | **PASS** | `GET /api/pasantias/ficha` → `http_code=200 bytes=452722 type=application/pdf time=2.34s`; first bytes `%PDF-1.3`; `content-disposition: inline; filename=\"Ficha-Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v2.pdf\"`; `cache-control: public, max-age=3600`. |",
        "| A2-5 | The ficha carries the right dates and **no prices** (D-02) | **PASS** | `pdftotext` of the downloaded file contains `Octubre, 5 al 16 · 2026 · 9 días de visitas · 7 …` and `Fiesta Nacional de España, colegios cerrados`. A scan for `€`, `EUR`, `USD` and thousands-separated numerals returns one hit only — `RUT 65.166.503-5` in the `LEGAL_IDENTITY` footer, which is an identifier, not an amount. |",
        "| A2-6 | The brochure link resolves and serves the priced document | **PASS** | `GET /api/pasantias/brochure` → `http_code=200 bytes=566882 type=application/pdf time=3.53s`; first bytes `%PDF-1.3`; `content-disposition: inline; filename=\"Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v5.pdf\"`. Prices present as D-02 requires: `€2.500`, `€120`, `€70`. The URL is stable and public by owner decision (D-05: UI-gated but shareable). |",
        "| A2-8 | The homepage card shows the correct single span | **PASS** | The delivered homepage HTML contains `Pasantías en Barcelona` and `Octubre, 5 al 16 · 2026`; `grep -c \"Abril 2026\"` → `0` and `grep -c \"Noviembre 2026\"` → `0`. This is the defect A1 was opened to fix (the card previously advertised a past April cohort and a wrong November one). |",
        "| A2-10 | The share preview metadata a WhatsApp unfurl reads is present and resolvable | **PASS** *(metadata only — the unfurl itself is A2-9)* | `/pasantias` serves `og:title` = `Pasantías INSPIRA Barcelona · Octubre, 5 al 16 · 2026 \\| Fundación Nueva Educación`, `og:description` naming 9 días / 7 escuelas, `og:url` = `https://nuevaeducacion.org/pasantias`, `og:image` = `https://nuevaeducacion.org/images/pasantias/bcn-skyline.jpg`, plus the `twitter:*` pair and `twitter:card=summary_large_image`. The image itself resolves: `http_code=200 bytes=1539868 type=image/jpeg`, 2400×1350 progressive JPEG. **See the size note under A2-9 before running it.** |",
        "| A2-7a | A real browser submission persists a lead row with correct split-consent evidence | **PASS** | `tests/e2e/pasantias-flow.spec.ts`, test 1 — `a real submission persists with split consent evidence and no false brochure stamp`, **674 ms**, run [`31276283612`](ci-run-31276283612.md) gate 4 (pass, 7m25s). Unmocked end to end: the form is filled and submitted on `/pasantias`, then the row is read back through `GET /api/admin/pasantia-leads` as the admin fixture (D-04: the table grants no authenticated write, and the public POST answers `200 {\"success\":true}` on both the insert and the update path, so it cannot be the evidence). Asserts `status='new'`, `cohort='octubre-2026'`, `consent_accepted_at` parseable, `consent_notice_version === PRIVACY_NOTICE_VERSION`, `marketing_opt_in === false` with `marketing_opt_in_at === null`, and `brochure_sent_at === null`. **Still never run locally** — see §D. |",
        "| A2-7b | The optional marketing opt-in is recorded only when clicked | **PASS** | Same spec, test 2 — `the optional marketing opt-in is recorded only when the visitor clicks it`, **652 ms**, run [`31276283612`](ci-run-31276283612.md) gate 4: a second unique address with the box ticked → `marketing_opt_in === true`, `marketing_opt_in_at` non-null and parseable. Tests 1 and 2 together are the only place both branches of D-12 are proven against a real row. |",
        "| A2-7c | The auto-reply claim is released rather than left standing when no mail can go out | **PASS** | Same spec, test 1 (674 ms), run [`31276283612`](ci-run-31276283612.md) gate 4: **the claim-and-release contract executed for the first time, and `brochure_sent_at` came back `null` as the design requires.** CI has no `RESEND_API_KEY` (the string appears nowhere in `.github/workflows/ci.yml`), so `sendLeadAutoReply` returns `{sent:false, failure:'not_configured'}`, `canReleaseAutoReplyClaim` is true, and `runAutoReply` restores the previous value. `lib/pasantias/emails.ts` states the intent in prose — a missing key must not silently mark a lead \"brochure sent\" for a day when nobody was mailed — and this run is the first time that sentence executed end to end rather than being asserted about. |",
        "| A2-7d | A9's spec leaves A8's seeded fixture exactly as seeded | **PASS** | Same spec, test 3 — `A8's seeded lead is untouched by this spec`, **17 ms**, run [`31276283612`](ci-run-31276283612.md) gate 4: `status` and `consent_notice_version` of `fixtures.pasantiasLead` still equal the values in `scripts/ci/e2e-fixtures.json`, read from the JSON rather than retyped. A8's own three `pasantias-leads-admin.spec.ts` tests ran green in the same job, so the two phases do not interfere. |",
        "| A2-4/6 (CI) | Ficha and brochure serve real PDFs from a cold cache | **PASS** | Same spec, test 4 — `the ficha and the brochure both serve a real PDF`, **1.4 s**, run [`31276283612`](ci-run-31276283612.md) gate 4: unauthenticated GETs on both routes assert `200`, `content-type: application/pdf`, and a body beginning `%PDF`. This is the CI-side counterpart to A2-4 and A2-6 above, which were executed against production. |",
        "### A2-9 — WhatsApp share unfurl on a named device",
        "### A2-11 — The auto-reply arrives at a test mailbox",
        "### A2-12 — The internal notification arrives",
        "### A2-13 — The brochure link *inside the received email* works"
      ]
    },
    {
      "commit": "9008bacddcf40a79aa4c051b11ab3a5baf33939b",
      "path": "docs/plan/LEDGER.md",
      "blob": "f7b84e83befa61ef079f8b0e1f64084067729a0e",
      "sha256": "162c8479dc21f6288cb84b4a4a7c0135a12e4be048db0949c239dcb66b76fc65",
      "lines": [
        "- **A9's OWNER-RUN ROWS, RESOLVED:** A2-9 (WhatsApp unfurl) **PASS**; A2-11 (auto-reply) **FAIL**; A2-12 (internal notification) **FAIL**; A2-13 (brochure link inside the received email) **BLOCKED** — untestable from a message that never arrived. All four had been PENDING since r1."
      ]
    },
    {
      "commit": "9008bacddcf40a79aa4c051b11ab3a5baf33939b",
      "path": "docs/plan/PLAN.md",
      "blob": "1f69ff486166a3bcb0ef099a8dec05c2494f2087",
      "sha256": "19b5a79b9c34457b760ab7d839a046634dd87161091a7ddf8f50bd18ea61948a",
      "lines": [
        "| A9 | Track A release verification (integration e2e + evidence) | **IN REVIEW** (r1 executed + PM-verified 2026-08-08; head `5550de57`, code `82bc0e7b`, base `7c7059ff`. **PR #46, run `31276283612`, all six gates green** — gate 4 ran all four `pasantias-flow` tests by name, zero retries, `12 mandatory spec(s) ran with no skips`. 0 BLOCKING / 1 SHOULD-FIX / 3 NIT. **Not DONE:** `[A3]` needs a fully green checklist and four owner-run rows remain — A2-9 WhatsApp unfurl, A2-11 auto-reply, A2-12 internal notification, A2-13 in-email brochure link.) | `phase/a9-verify` | A6b, A7a, A7b, A8 |"
      ]
    },
    {
      "commit": "76349909621bc07a1c7ab8242cd3c3ececaed152",
      "path": "docs/plan/PLAN.md",
      "blob": "0dc0e4e828a6fd7c49f2a2bf0afb16fec54676b0",
      "sha256": "a99fd4ef3adb0706e305ea785738b4d762ae9f2bf78109dc7d486ab4cd4a950d",
      "lines": [
        "| A9 | Track A release verification (integration e2e + evidence) | TODO | `phase/a9-verify` | A6b, A7a, A7b, A8 |"
      ]
    },
    {
      "commit": "9008bacddcf40a79aa4c051b11ab3a5baf33939b",
      "path": "scripts/ci/e2e-mandatory.mjs",
      "blob": "0c22464de43c08c73ed59e3fd12744c413f98935",
      "sha256": "37384db49eac65671afd5e51c20ce687e98af993b3811f432be8d00bc1618630",
      "lines": [
        "  'tests/e2e/pasantias-flow.spec.ts',"
      ]
    }
  ]
}
```
