# CODEX REVIEW — A0 round 2

VERDICT: PASS

Round-1 `[B1]` is closed. The exact branch head renders the approved controller identity in both places where the privacy notice identifies the controller, defines «FNE» before using that short form, and no longer contains a brand-alone controller statement. The remediation introduces no new finding.

BLOCKING:

- None.

SHOULD-FIX:

- [S1 — owner-side, unchanged] Ratify `info@nuevaeducacion.org` as the data-subject-request mailbox before its first new consent-flow consumer — `lib/legal/privacy-notice.ts:53`. The fix did not introduce or broaden this exposure: the same mailbox was already rendered in the pre-A0 contact block, and it is now centralized in `LEGAL_IDENTITY` for a one-field correction if the owner chooses another address.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- `[B1]` **CLOSED** — `components/PrivacyPolicyContent.tsx:30-35` renders the identification paragraph from `LEGAL_IDENTITY`: brand, `Fundación Instituto Relacional`, `RUT 65.166.503-5`, and `Carlos Silva Vildósola 10448, La Reina, Santiago, Chile`. It defines the short form `(en adelante, «FNE»)`; §1 then uses `FNE`, as does the pre-existing §4 reference.
- `[B1]` **CLOSED** — `components/PrivacyPolicyContent.tsx:122-137` renders the same legal name, RUT, and full postal address in the §10 contact block, alongside the centralized mailbox. The former `Dirección: Santiago, Chile` string is absent.
- Independently rebuilt final head `0c72a75` and inspected the running production build at `/privacidad`. The rendered identity paragraph and §10 block contain the approved values; no paragraph outside those two identity blocks names `Fundación Nueva Educación` as the controller; and the «FNE» definition precedes its section-level use. The fresh prerendered HTML independently contains the legal name, RUT, street address, and city twice each, and the generic address zero times.
- The new rendered-component tests are appropriately regression-oriented. They would fail if the legal identity disappeared, the generic address returned, or the brand-alone §1 statement were restored. Independent targeted run: 3 files, 17/17 tests passed. Independent production build also passed with `/privacidad` prerendered. PR #28 is mergeable and all checks are green on final head: typecheck, zero-warning lint, Vitest, pgTAP, seeded Playwright, RLS migration guard, and Vercel preview.
- The decision not to bump `PRIVACY_NOTICE_VERSION` is accepted. `2026-07-v1` has not been deployed as a notice cited by a consent record; A6b is the first exposure in which a person can accept that version. Treating `17f3da8` as a pre-release correction preserves a single truthful initial version instead of manufacturing an unused v1/v2 history. Once A6b exposes and records `2026-07-v1`, any substantive notice change must bump both the version and publication date as the module contract requires.
- Re-review scope was respected: `17f3da8` changes only `PrivacyPolicyContent.tsx` and its new rendered-identity test. The later commits modify only the review request and ledger. No round-1 finding other than `[B1]` was reopened, and no new issue was introduced by the fix.
