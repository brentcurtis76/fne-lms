# Contract and annex document design review

Branch: `feat/contract-design`. Integrated base: `097b62ed` (origin/main, merged without conflicts in `c8efee4f`). Original design commit: `d4ab5df7`. A release-verification follow-up adds print guidance, CLP labels, and stronger PDF assertions.

## Objective and scope
Apply the user's Claude Design anexo reference to the FNE-LMS contract and annex PDF generators. The reference project is `11edbb3b-51e9-45c1-98b2-dbd1c0ff9556`, file `Anexo de Contrato FNE-2026-06-488A1.dc.html`. Its full ZIP was exported through the user's authenticated browser because claude_design MCP is unavailable in this session. HTML, design tokens, fonts, logo and runtime files are retained outside the repository in the task workspace.

In scope: active contract and annex form previews, saved-document print route, shared document styling and synthetic regression proofs. Out of scope: legal terms, database/authentication changes, existing uploaded/signed PDFs, unused legacy React-PDF components, production deployment. Release integration and PR CI are now authorized. No itinerary was supplied for this design task.

## Result and behavior
Mont typography, the reference gold logo, black headings, yellow title rule, numbered annex sections, restrained payment tables and side-by-side signature spaces now share a Letter print layout. A representative short annex prints on one page including signatures. Longer content flows without clipping; the 30-payment stress example uses three pages, with signatures and footer together. The full synthetic contract uses five pages.

Both form actions now open a preview with **Imprimir / Guardar PDF**, using native browser printing instead of the contract's text-stripping jsPDF renderer and annex's A4 HTML renderer. This is a deliberate user-visible change from immediate file download. It preserves vector text and embedded Mont in browser PDFs. Popup opening occurs synchronously before asynchronous annex-number lookup. Asset loading completes before enabling the print control. The preview explicitly sets its origin as the asset base and disconnects window.opener.

Annex installments now map form `monto` into the currency-specific fields expected by the template; previously the preview could show zero. Annex names retain their stored capitalization to match the reference. Singular installment grammar is corrected. Template data is HTML-escaped and replaced with callbacks so literal dollar replacement tokens remain literal. Existing legal clauses and currency/date semantics are retained. Contract headings split at their first newline so adjacent legal body text is not incorrectly bolded.

## Files by risk
- Presentation and preview lifecycle: `lib/contract-document.ts`, `components/contracts/ContractForm.tsx`, `components/contracts/AnnexForm.tsx`, `pages/contract-print/[id].tsx`.
- Legal text presentation and value interpolation: `lib/contract-template.ts`, `lib/annex-template.ts`.
- Brand asset: `public/logos/contract-horizontal-gold.png`, copied from the requested reference. Existing licensed Mont files are reused.
- Verification: `lib/__tests__/contract-document.test.ts`, `tests/contract-document-print.spec.ts`, `playwright.contract-documents.config.ts`.

## Validation
Node 22.22.0; local dependency tree reused from the main checkout during validation.

- `npm run type-check`: exit 0.
- `npm run lint`: exit 0, zero warnings.
- `npm test`: exit 0; 325 files, 7,435 passed, 11 pre-existing skips. Full run includes the four new document tests. A subsequent base-URL addition to the preview helper is covered by the final browser checks and final build/type-check.
- `playwright test -c playwright.contract-documents.config.ts`: exit 0; four checks: short annex, full contract, 30-payment annex, and actual preview popup/asset loading. All use synthetic content/local assets; no database or external service.
- `npm run build`: exit 0 using only synthetic build credentials and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. No real environment files copied.
- PDF extraction: Letter pages confirmed; 1/5/3 pages for short annex/contract/long annex. PNG review performed, including signature and section transitions.
- `git diff --check`: passed.

Initial attempts are not relabeled green: Node 26 unit run interrupted; it left an owned mutation-test fixture, which caused three inventory failures and an overlapping build failure. The fixture was removed; the full Node 22 run then passed. The first build lacked required Supabase configuration. The final build ran after mutation tests, with synthetic settings. A mocked-network popup test stalled asset requests; the final test uses an ephemeral local HTTP server and passes.

External evidence: `/Users/brentcurtis/Documents/ChatGPT/RLS Review/contract-design-evidence/` (logs, PDFs, PNGs and reference hashes). The original export is retained in `../design-reference/` relative to that directory.

## Reviewer focus
1. Compare the short annex proof with the source design, especially font weights, signature space and Letter margins.
2. Review paragraph-to-HTML transformation against all sixteen original contract clauses and their lists.
3. Check preview lifecycle and the deliberate change from download to browser Save PDF, including popup blocking.
4. Verify UF/CLP mapping and HTML escaping retain all dynamic values without introducing markup.
5. Check long names and installment schedules; one-page output is demonstrated for the short fixture, not forced for arbitrarily long content.

## Integrated release verification (2026-09-08)
- Full merged-main unit suite: 416 files, 9,716 passed / 12 existing skips.
- Type-check, zero-warning lint, and production build: passed on Node 22 with synthetic local environment.
- Disposable local Supabase stack `contract-design-test` (API 54451, DB 54452): 31 pgTAP files, 2,506 assertions passed.
- Computer use: logged in as a synthetic admin, created a CLP contrato and anexo through the application, reopened both saved PDF routes, checked dates/amounts/logo/fonts/signatures, and opened both form previews in native Safari. Production was not contacted.
- Fixed the existing contracts-list CLP-as-UF label; three added currency cases and the targeted document/page suites passed (14 tests).
- Added the print spec to mandatory CI and PDF text assertions for both signatures/footer plus expected page counts. Four Chromium checks passed.
- **Open release blocker:** native Safari PDF export omits trailing signatures in representative fixtures despite their presence in browser previews. Diagnostic layout experiments remain outside the repository. Safari PDF output is not approved yet.

## Limitations and release status (initial implementation history)
Chromium printing is tested. No authenticated application/database E2E, Safari print verification or Production operation was performed. Static screenshots do not substitute for testing real application permissions; those paths were not modified. Existing full-suite skips remain unchanged. Local commit only; no push, PR, merge or deployment.
