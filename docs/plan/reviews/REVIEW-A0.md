# CODEX REVIEW — A0 round 1

VERDICT: FAIL

A0 satisfies the owner-sign-off, privacy-versioning, and split-consent portions of [A1]–[A3]. The frozen D-12 decision is represented correctly, and the approved A-10 values are correct in `LEGAL_IDENTITY`. The phase is not complete because the public privacy notice remains a contradictory legal block: it still presents the fantasy name as the controller and omits the approved legal name, RUT, and postal address.

BLOCKING:

- [B1] The approved A-10 controller identity is not rendered by the existing privacy-notice legal block — `components/PrivacyPolicyContent.tsx:104` — Appendix A-10 requires footer/legal blocks to show both the brand and legal entity plus RUT and full address, and `lib/legal/privacy-notice.ts:9` expressly says `LEGAL_IDENTITY` is the identity shown in the notice. Instead, the contact block at lines 108–112 hard-codes only `Fundación Nueva Educación` and `Dirección: Santiago, Chile`. The production build confirms that `/privacidad` contains neither `Fundación Instituto Relacional`, `RUT 65.166.503-5`, nor `Carlos Silva Vildósola 10448`. This preserves the exact legal/brand confusion round 2 was meant to fix and violates the normative owner-approved decision. Required closure: render the contact block from `LEGAL_IDENTITY`, showing brand name, legal name, RUT, and full postal address, and add a component assertion for those rendered values so the exact-value unit test cannot pass while the public legal block remains wrong.

SHOULD-FIX:

- [S1] Ratify the data-subject-request mailbox before its first new consumer — `lib/legal/privacy-notice.ts:41` — `contactEmail` is documented as the Ley 21.719 request address and bundled into the owner-approved identity object, but Appendix A-10 did not approve it and both executor and PM reports record it as unverified. The value matches the pre-existing privacy-page contact address, so this does not independently block A0.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- [A1] Verified. Appendix A is explicitly normative, all A-1–A-15 rows are resolved, and the Decision Log records Brent's approval of the complete brief, including A-10 and both consent sentences.
- [A2 / D-12] Verified. `CONSENT_PROCESSING_TEXT` is limited to answering the request and delivering the requested program; `CONSENT_MARKETING_TEXT` is distinct, explicitly optional, scoped to news/program communications, and revocable. No required acknowledgement is represented as marketing opt-in. The privacy page renders the fixed `2026-07-v1` version and `30-07-2026` date rather than the runtime clock.
- [A3] Targeted command passed: 3 files / 19 tests. Independent full gates also passed on head `d02ee17`: type-check; lint with zero warnings; unit suite 228 files / 3389 tests; production build with 156 static pages. DB and E2E gates are not applicable to this constants/content phase.
- Reviewed both executor commits (`82a14cd`, `b50bff3`), the subsequent Appendix/Decision Log amendments, the round reports, and the final PM ledger head. The worktree is clean, `git diff --check` is clean, and no cohort, lead, email-feature, schema, dependency, or middleware code entered the phase diff.
