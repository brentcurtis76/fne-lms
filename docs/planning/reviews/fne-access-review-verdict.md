# Independent access-control code review

Reviewer agent `/root/review`; read-only review completed 2026-10-06. Migration SHA256 `a53d9715dfe917658e816eb1d06e402749af80a394003e14b26ef52cad604d2b`.

**Code verdict: APPROVE WITH NOTES.** No unresolved blocker or major code finding remains. This is not release approval.

Re-reviewed: four financial client-document routes require authoritative active noncached admins and password gate; discussion UI uses returned thread workspace for NULL legacy compatibility; new group writes enforce community/school consistency; original group-member school/community scope preserved; original identity guard permits PostgreSQL FK parent-delete action without new exceptions; finance restrictions, group privacy, invoker view and parent checks consistent with approved scope.

Minor documentation finding: malformed-history statement overstated existing mismatched group protection. Corrected review request to state stored school_id remains authoritative for existing malformed groups; preflight must show zero or resolve before rollout.

Completion/release conditions: exact candidate DB/unit/typecheck/lint/build/browser gates; exclude temporary runtime config and local evidence; historical-shape preflight; approved raw contratos expansion with scoped hour summaries; exact-package production approval. No reviewer edits, production writes or deployment.

Narrow re-review of discussion reload repair: APPROVE. Separate profile reads use the authenticated browser client and preserve profile RLS; IDs originate only from readable memberships/messages. Attachment loading and author fallbacks remain intact. Synthetic module fixture correction matches the lesson relationship. Final typecheck and real send/reload acceptance required.

Narrow re-review of persisted message array defaults: APPROVE. Missing mentions/reactions/attachments default to empty arrays while preserving supplied details. No access rule changed.

Repeat-run fixture review: APPROVE. Urgent fixture cleanup removes only its local synthetic assignment's attachment/message/thread dependencies before groups, in a transaction after loopback checks. External runner reset removes only an exact synthetic role and linked-session/consultor attendee pair. No production route or repository seeder was changed. Source review found no supported app/API group deletion path; community deletion already refuses existing group/workspace dependencies, and membership removal remains separate.

Contract expansion independent read-only re-review: APPROVE WITH NOTES. Migration SHA2564fbcdd8814357d90af12dbe2a483d4fb45cbe49ed78180e344452099dbdff3d3. Restrictive raw contratos cap uses active literal admin/password gate and revokes anonymous access; service authorization remains. The helper binds auth.uid()+active ED own-school+password gate and returns boolean only. Child policies preserve baseline SELECT audience only. No write or raw legal audience expansion. SQL157-assertion matrix,4 real JSON/PDF privacy tests and browser summary case reviewed. Exact policy expectation in063 correctly adds approved preservation. Recovery queue deferral in100 is rollback-only fixture isolation; all worker/priority assertions remain. Exact expanded terminal gates PASS:DB70files/7207assertions, unit504files/12516tests (12existing skips), productionbuild/type/lint/allguards, browser269passed/21mandatoryspecs no skips. Live read-only catalog/history preflight and parent release approval remain required. Existing five-summary password-gate omission remains separate debt.

Release packaging reconciliation: live read-only preflight2026-10-06 returns13zero structural counts and expected forced-RLS contratos seven-policy/grants/legal-snapshot catalog; candidate caps absent as expected before release. Remote main unchanged41a9a8a2. User explicitly authorized publishing, merging and deploying this reviewed batch after requiredCI. No code/migration changes during packaging.
