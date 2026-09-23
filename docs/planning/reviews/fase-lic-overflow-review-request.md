# Document filename containment

Local candidate; release and authenticated full-application E2E pending.
Branch: `fix/lic-overflow`; base: `643d0c4f71ec2957f65a417b9edc8a5211006bee`; one local delivery commit.

## Outcome and scope

Fix long unbroken filenames extending beyond the historical archive rows and overlapping preview/download controls. ArchiveView and DocumentCenter now use a bounded text column, wrap filenames anywhere, preserve title ellipsis with the full title on hover, and move actions below text on narrow screens. The active document header also wraps on narrow screens. No API, authentication, storage, database, or document-action logic changes.

## Changed files

Low-risk presentation only: `components/licitaciones/ArchiveView.tsx`, `components/licitaciones/DocumentCenter.tsx`. This review request and PROJECT_STATE.md record local delivery.

## Validation

Evidence directory: `/home/brent/Projects/pm-workflow/runs/LIC-OVERFLOW-20260923`.
- Node 22.16.0 type-check, zero-warning lint, and production build: passed. Build used explicit synthetic loopback Supabase settings, no production credentials.
- Document preview unit regression: 14/14 passed.
- Full unit regression: 440 files passed; 10,398 tests passed, 12 existing skips; exit 0. Used a temporary equivalent Vitest config with cache disabled and Node 22.16.0; focused regression also passed with these dependencies.
- Playwright UI: 12 view/width combinations, both actual React components at 320, 390, 640, 768, 1024, 1440 px; six long synthetic filenames per list; no horizontal document overflow, no filename/action overlap. Preview opens and closes in every combination. Admin controls included; nonadmin harness also checked. Final scoped `npm run e2e -- --config /tmp/lic-overflow-evidence/playwright.config.cjs`: 1/1 passed.
- Desktop/mobile screenshots visually inspected. Harness imports actual components and uses mocked synthetic API responses. This is not authenticated full-application E2E or production verification.
- DB checks: not applicable; no DB changes. Full application E2E was not run because the existing local application belongs to another unit; it was left untouched.
- `git diff --check`: passed.

## Review focus and limits

1. Very long unbroken names must stay inside the text column while metadata remains readable.
2. Both action sets must remain visible and usable across the responsive breakpoint, including admin delete.
3. Preview/download handlers and authorization behavior must remain unchanged.

No push, PR, merge or deployment. The live site is unchanged. Temporary harness and logs retained as local evidence; no pre-existing work modified.
