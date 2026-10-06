# Community document links — local repair review

Branch: `fix/doc-links`. Base: `541c84b92320e6b8e9f36450f1f72c530cf109c8`. Intended commit count: 1 local repair commit.

Objective: repair the existing relative-storage-key mismatch in community document preview/download, exercise real leader and consultor uploads, and preserve the frozen urgent anonymous-boundary candidate. Production application, migration application, unrelated report failures and public asset repairs are outside this repair's scope.

## Changes by risk

- Reader boundary: `lib/storage/community-document-url.ts` resolves canonical object keys against configured Storage; accepts existing same-origin Storage URLs only for the configured bucket, and rejects malformed, traversal and foreign URLs.
- UI integration: `components/documents/DocumentPreview.tsx` and the Documents handler in `pages/community/workspace.tsx` use the resolved URL. Invalid paths cause no preview request and a Spanish download error. Attachment handlers and the download API are unchanged.
- Upload representation: `utils/documentUtils.ts` removes a discarded public URL lookup and documents continued canonical-key storage. No data migration or write format change.
- Verification: resolver and preview component tests; an isolated four-case Playwright suite for leader/consultor × PNG/PDF. It uses actual UI upload, preview and download, reload, exact byte comparison, initial version checks, and legacy absolute-URL compatibility on its own synthetic rows.

## Evidence

Evidence directory: `.doclinks/` in the local repair checkout, not committed. Gate receipts and aggregate logs record final validation; the external repair handoff records exact counts and commit SHA.

- Focused unit/component tests: 24 passed.
- Real UI journeys: 4 passed, no expected-failure annotations. PNG previews decoded; PDF preview response bytes matched. Chrome's visible PDF plugin also rendered the synthetic document (`screens/chrome-pdf.jpg`).
- Initial unchanged security HTTP proof: 110/110 passed against the candidate private stack. Repeat Node 22 proof passed 110/110. Full Node 22 Vitest passed 502 files / 12,477 tests, with 12 existing skips; production build passed 149 static pages; pgTAP passed 68 files / 6,657 assertions; browser boundary guard passed. Final Node 22 build browser run passed all 4 cases again in 12.7 seconds.
- Type checking and zero-warning lint passed. The first pgTAP attempt reached no assertions because the CLI requested TLS from a loopback PostgreSQL server without TLS; retry with loopback-only `sslmode=disable` passed. A scope review initially blocked retry; direct original human approval was verified through the parent conversation before the retry was accepted.

## Independent review focus

1. URL normalization: ensure raw traversal and foreign hosts cannot enter iframe/image or the existing download route through this UI.
2. Compatibility: canonical keys retain segment encoding, existing permitted public/signed/authenticated Storage URLs preserve query strings, and configured bucket/origin rules match the release environment.
3. UI scope: verify only Documents preview/download changed; no service credentials or permission checks were expanded.
4. Acceptance strength: distinguish actual upload/version/reload/exact-byte checks from the separate synthetic legacy-row compatibility check; PDF plugin rendering requires the supplied visible Chrome evidence.
5. Release integration: combine the app repair with the separately frozen security package without changing its four file hashes, then retain security and production HOLD authority with the main task.

## Limitations and deployment plan

This local checkout uses the main task's private synthetic Supabase stack and installed dependencies. Copied urgent security migration/test/proof files are integration inputs and are excluded from the repair commit. The repair introduces no database migration and needs no rewrite of existing relative paths.

Independent review and the main task's remaining acceptance/preflight are required. After review, the production owner can cherry-pick the repair onto its approved release branch, rerun release CI and preview acceptance, and use Brent's controlled main-branch release path. This task must not push to main, trigger Vercel, or apply production SQL. Keep the security boundary migration active if an application rollback is needed; resolve an application regression independently. Existing school/community report schema defects and the missing team portrait remain outside this repair.
