# Bidding document preview — independent review request

Status: implementation frozen; type-check, lint, unit and build passed; authenticated application E2E passed (223/223; 16 mandatory specs, no skips). This request does not assert phase completion.
Branch `feat/lic-preview`, base `9eff7b4e58e91edc20f71f75651fd73709b234ad`; final HEAD recorded in the executor commit receipt; 1 local implementation commit authorized after PM acceptance (SHA recorded in the executor commit receipt).

Objective: accessible Spanish inline preview in ArchiveView and DocumentCenter, retaining authorized downloads. Scope includes PDF, raster images, local DOCX text preview and unsupported-format fallback; excludes duplicate deletion, API/auth changes, external viewers, migrations and publication.

Files by risk:
- Document loading and content handling: `components/licitaciones/DocumentPreview.tsx`, `lib/licitaciones/documentPreview.ts`.
- Low-risk integration: `components/licitaciones/ArchiveView.tsx`, `components/licitaciones/DocumentCenter.tsx` (also displays previously omitted anexos).
- Verification: `__tests__/components/licitaciones/document-preview.test.tsx` (14 focused cases).

Review priorities:
1. Existing download-doc endpoint authorization remains the only URL issuer; verify no school/document scope bypass.
2. Blob cleanup, abort/late responses, retry and dialog focus/Escape behavior.
3. DOCX is escaped text only, rejects DTD/entities, limits XML expansion, preserves paragraph/tab/break content; it intentionally does not reproduce original formatting/images.
4. Narrow supported filename types; no HTML/SVG execution or external viewer URLs.
5. Desktop/mobile ergonomics and existing download availability, including unsupported legacy Word.

Evidence: final executor report in `/home/brent/Projects/pm-workflow/runs/LIC-DOCS-20260923/executor-report-r0-continuation.md`; focused final 14/14 passed, type-check/lint passed; full unit 438 files passed (10,219 tests passed, 12 skipped, 0 failed); build passed (149 pages generated). PM owns Computer Use evidence from a standalone synthetic harness that imports actual components. Full application E2E passed on a newly established, unit-owned synthetic local Supabase/app target (API54521/DB54522/app3117). PM also verified real authenticated archive and active previews via CUA. Supabase2.117 cached images were used after2.110 downloads hit a registry rate limit; this version deviation is documented. No production access occurred in the preview executor lane. No baseline failure is waived by this document.

Limitations: DOCX text-only view; legacy .doc requires download. PDF rendering depends on the browser's native viewer and provides download fallback. Preview bounded to 25 MB; Word XML bounded to 5M characters. No production preview verification or deployment. Product code unchanged during E2E continuation; all original product hashes verified.
