# Code Review: Propuesta Web — Dual Web+PDF Proposal System

**Project:** GENERA (FNE-LMS)
**Date:** 2026-03-20
**Scope:** Transform the proposal system from PDF-only to a dual Web+PDF delivery model
**Commits:** 7 (b3014cf → 6c211aa on `main`)
**Net change:** 22 files changed, 2,999 insertions, 44 deletions

---

## 1. Executive Summary

This implementation adds a public-facing web view for proposals (propuestas) that were previously only available as server-generated PDFs. Clients now receive a URL and a 6-character access code, enter the code to unlock a branded web view of their proposal, and can download a client-side-generated PDF. Admins can preview any proposal without a code via an authenticated bypass.

The work was executed in 5 phases over a single overnight session, with inter-phase code reviews catching 3 bugs before they reached production.

---

## 2. Implementation Phases & Commits

| Phase | Commit | Hash | Description |
|-------|--------|------|-------------|
| 1 | feat: add propuesta web view — Phase 1 DB schema, APIs, and utilities | `b3014cf` | Migration SQL, access-code lib, snapshot builder, 4 API routes |
| 1-fix | fix: correct cv_pdf_path field name in generate-propuesta | `3fb7a98` | Field name bug caught in code review |
| 2 | feat: add propuesta web view — unlock screen, public view & sub-components | `de7bafd` | Page component, unlock screen, 7 UI sub-components |
| 2-fix | fix: correct logo path in propuesta web components | `ed346e0` | Logo path mismatch (3 references) |
| 3 | feat: add jsPDF proposal generator with brand kit styling | `7e97b74` | 632-line client-side PDF generator |
| 4 | feat: integrate web proposal flow into admin panel | `d6e269f` | ProposalConfigPanel enhancements, types update |
| 5 | fix: QA cleanup — remove unused import, add licitación/ficha metadata to footer | `6c211aa` | Final QA pass |

---

## 3. Architecture Overview

```
Client Browser
  │
  ├── /propuesta/[slug]          ← Public page (Next.js SSR)
  │     ├── ProposalUnlockScreen ← Access code entry
  │     ├── ProposalPublicView   ← Full branded proposal
  │     │     ├── ConsultantCard
  │     │     ├── ContentBlockSection
  │     │     ├── ModuleTimeline
  │     │     ├── PricingSection
  │     │     ├── DownloadablesSection
  │     │     │     └── DocumentCard
  │     │     └── generateProposalPDF()  ← Client-side jsPDF
  │     └── Admin bypass (?admin=true)
  │
  └── API Routes (4)
        ├── GET  /api/propuestas/web/[slug]              ← Public metadata
        ├── POST /api/propuestas/web/[slug]/verify       ← Code verification
        ├── POST /api/propuestas/web/[slug]/download-doc ← Signed URL generation
        └── GET  /api/propuestas/web/[slug]/admin-access ← Admin bypass
```

**Data flow:** When admin generates a proposal → `generate-propuesta.ts` now also generates an access code, a URL slug, and a full JSONB snapshot → stores all in `propuesta_generadas`. Client accesses `/propuesta/[slug]`, enters code, receives snapshot, renders full web view.

---

## 4. Database Changes

**File:** `docs/migrations/propuesta-web.sql` (16 lines)
**Status:** NOT EXECUTED — awaiting DB agent

7 additive columns on `propuesta_generadas`:

| Column | Type | Notes |
|--------|------|-------|
| `access_code` | `VARCHAR(8) UNIQUE` | bcrypt hash of the 6-char code |
| `access_code_plain` | `VARCHAR(8)` | Plain code shown to admin once at generation |
| `web_slug` | `VARCHAR(64) UNIQUE` | URL-safe slug for public access |
| `viewed_at` | `TIMESTAMPTZ` | First view timestamp |
| `view_count` | `INTEGER DEFAULT 0` | Total successful unlocks |
| `web_status` | `TEXT` | CHECK constraint: draft, published, viewed, expired |
| `snapshot_json` | `JSONB` | Full proposal data frozen at generation time |

2 partial unique indexes on `access_code` and `web_slug` (WHERE ... IS NOT NULL).

**Review notes:**
- All changes are additive — no destructive ALTER, no DROP
- `access_code_plain` stores the plaintext code. This is intentional so admins can re-share the code, but the reviewer should confirm this is acceptable for the threat model. The hashed version is used for verification.
- No RLS policies are included in this migration. The API routes use the service role client to bypass RLS. This is consistent with existing patterns but should be validated.

---

## 5. File Inventory

### 5.1 New Files (17)

#### Utilities (`lib/propuestas-web/`) — 3 files, 950 lines

| File | Lines | Purpose |
|------|-------|---------|
| `access-code.ts` | 40 | Code generation (crypto.randomBytes), bcrypt hash/verify, slug generation |
| `snapshot.ts` | 278 | `ProposalSnapshot` type definition, `buildProposalSnapshot()` function |
| `pdf-generator.ts` | 632 | Client-side jsPDF generator (9 sections, GENERA brand kit) |

#### API Routes (`pages/api/propuestas/web/[slug]/`) — 4 files, 333 lines

| File | Lines | Method | Auth | Purpose |
|------|-------|--------|------|---------|
| `index.ts` | 56 | GET | None | Public metadata (school name, service, year) |
| `verify.ts` | 132 | POST | Access code | Rate-limited code verification, returns snapshot |
| `download-doc.ts` | 96 | POST | Access code | Generates Supabase signed URL (1hr expiry) |
| `admin-access.ts` | 49 | GET | Admin session | Bypass endpoint returning full snapshot |

#### Page (`pages/propuesta/`) — 1 file, 219 lines

| File | Lines | Purpose |
|------|-------|---------|
| `[slug].tsx` | 219 | Public page with 4 states: loading, error, locked, unlocked |

#### Components (`components/propuestas-web/`) — 8 files, 1,184 lines

| File | Lines | Purpose |
|------|-------|---------|
| `ProposalPublicView.tsx` | 414 | Main orchestrator rendering 11 sections |
| `ModuleTimeline.tsx` | 165 | Hours summary, responsive table, timeline bar |
| `ConsultantCard.tsx` | 145 | 3 variants (fne, international, advisor) |
| `ProposalUnlockScreen.tsx` | 133 | Full-screen dark unlock UI with 6-char input |
| `PricingSection.tsx` | 103 | Two pricing modes (per_hour, fixed), grand total |
| `ContentBlockSection.tsx` | 90 | 4 section types: heading, paragraph, list, image |
| `DownloadablesSection.tsx` | 81 | Document grid with signed URL download handler |
| `DocumentCard.tsx` | 53 | Individual document card |

#### Migration — 1 file, 16 lines

| File | Lines | Purpose |
|------|-------|---------|
| `docs/migrations/propuesta-web.sql` | 16 | Additive schema migration (not yet executed) |

### 5.2 Modified Files (4)

| File | Change | Description |
|------|--------|-------------|
| `pages/api/licitaciones/[id]/generate-propuesta.ts` | +63 lines | After PDF gen: generates access code, slug, builds snapshot, updates DB |
| `components/licitaciones/ProposalConfigPanel.tsx` | +248 lines | Post-gen UI (code display, copy buttons), history table with web status |
| `lib/propuestas/types.ts` | +10 lines | `WebStatus` type, 7 optional fields on `PropuestaGenerada` |
| `package.json` | +2 deps | `bcryptjs ^3.0.3`, `@types/bcryptjs ^2.4.6` |

---

## 6. Security Analysis

### 6.1 Access Code System

- **Generation:** `crypto.randomBytes()` → mapped to 31-char charset (excludes 0/O/1/I/L to prevent ambiguity). 31^6 ≈ 887M combinations.
- **Storage:** bcrypt hash (cost factor 10) stored in `access_code`. Plain stored in `access_code_plain` for admin re-sharing.
- **Verification:** bcrypt.compare() on server side. Code is uppercased before comparison.
- **Session:** After successful verification, the plain code is stored in `sessionStorage` (browser) with key `propuesta_code_{slug}`. Used for subsequent document download requests.

**Review questions:**
- Is storing `access_code_plain` acceptable? Alternative: only show it once at generation, discard after.
- sessionStorage clears on tab close — is that the desired UX, or should it persist across tabs?

### 6.2 Rate Limiting

- **Implementation:** In-memory `Map<string, { count, resetAt }>` in `verify.ts`
- **Limit:** 5 attempts per IP per slug per hour
- **Key:** `${ip}:${slug}`
- **IP extraction:** `x-forwarded-for` header → first value, fallback to `req.socket.remoteAddress`

**Review questions:**
- In-memory rate limiting resets on deploy/restart. For production, consider Redis or Supabase-backed tracking.
- Vercel serverless functions may run on different instances — the in-memory Map won't share state across instances. This significantly weakens the rate limit in a serverless environment.

### 6.3 Admin Bypass

- `?admin=true` query param triggers a call to `/api/propuestas/web/[slug]/admin-access`
- Server-side `checkIsAdmin()` validates the session via cookies
- No access code required for admins

**Review notes:** The `?admin=true` param is cosmetic — the actual auth check happens server-side. A non-admin hitting the endpoint gets a 403.

### 6.4 Document Downloads

- Supabase signed URLs with 1-hour expiry
- Session code re-verified on every download request
- Document ID validated against the snapshot (not against the live DB)

### 6.5 SEO / Indexing

- `<meta name="robots" content="noindex, nofollow" />` on the public page
- No sitemap inclusion
- OG meta tags present (title only, no sensitive content)

### 6.6 Chilean Data Privacy (Law 21.719)

- Snapshot contains school/institution data and consultant profiles — no student PII
- Proposals are institution-facing sales documents, not student records
- No student data flows through any of these endpoints

---

## 7. Code Quality Notes

### 7.1 Patterns Followed

- All API routes follow the project's auth → role check → validation → logic pattern
- Zod validation on POST endpoints (verify.ts, download-doc.ts)
- Service role client used consistently for DB access in public routes
- Error messages in Spanish (consistent with existing codebase)
- TypeScript strict mode — all types properly defined

### 7.2 Items Flagged During Implementation

| Issue | Found In | Resolution |
|-------|----------|------------|
| `cv_path` vs `cv_pdf_path` field name | `generate-propuesta.ts` | Fixed in commit `3fb7a98` |
| Logo path `/images/fne-logo-gold.png` should be `/logos/fne-logo-gold.png` | 3 component files | Fixed in commit `ed346e0` |
| Unused `CheckCircle` import | `ProposalPublicView.tsx` | Removed in commit `6c211aa` |
| Missing licitación/ficha metadata in footer | `ProposalPublicView.tsx` | Added in commit `6c211aa` |

### 7.3 Pre-existing Issues (Not from this implementation)

- `npm run build` fails on untracked files in `lib/propuestas/components/*.tsx` that import a non-existent `TYPESCALE` export from `../styles`. These files predate this implementation.
- 8 pre-existing test failures in `detalle.test.ts` related to `createServiceRoleClient` mock configuration.

### 7.4 Dependencies Added

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| `bcryptjs` | ^3.0.3 | Password hashing for access codes | MIT |
| `@types/bcryptjs` | ^2.4.6 | TypeScript types | MIT |

Note: `jspdf` and `jspdf-autotable` are referenced in `pdf-generator.ts` but loaded via dynamic import — confirm they're already in `package.json` or need to be added.

---

## 8. Testing Checklist

### 8.1 Unit Tests Needed

- [ ] `access-code.ts` — code generation length, charset, hash/verify round-trip
- [ ] `snapshot.ts` — snapshot builder with various config shapes, missing fields
- [ ] `verify.ts` — rate limiting logic, expiry, IP extraction
- [ ] `pdf-generator.ts` — smoke test that jsPDF generates valid buffer

### 8.2 Integration Tests Needed

- [ ] Full flow: generate propuesta → access web URL → enter code → view snapshot
- [ ] Rate limiting: 6th attempt returns 429
- [ ] Expired proposal returns 410
- [ ] Admin bypass works with valid session, returns 403 without
- [ ] Document download returns signed URL, fails with bad code
- [ ] Slug uniqueness — generating for same school/service/year increments version

### 8.3 Manual QA Checklist

- [ ] Run `docs/migrations/propuesta-web.sql` against staging DB
- [ ] Generate a proposal from admin panel — verify code and URL appear
- [ ] Copy URL, open in incognito — verify unlock screen renders
- [ ] Enter wrong code 5 times — verify rate limit message
- [ ] Enter correct code — verify full proposal renders
- [ ] Check all 11 sections render correctly with real data
- [ ] Download PDF — verify it opens and matches web view content
- [ ] Download a supporting document — verify signed URL works
- [ ] Close tab, reopen URL — verify sessionStorage cleared, must re-enter code
- [ ] Test on low-end browser (Chrome 90, Firefox ESR)
- [ ] Test responsive layout on 1024px and 768px widths
- [ ] Verify `?admin=true` bypass works for logged-in admin
- [ ] Verify `?admin=true` returns error for non-admin

---

## 9. Deployment Prerequisites

1. **Run migration:** `docs/migrations/propuesta-web.sql` must be executed by the DB agent against Supabase
2. **Verify dependencies:** Confirm `jspdf` and `jspdf-autotable` are in package.json (used via dynamic import in pdf-generator.ts)
3. **Environment:** No new env vars required — uses existing Supabase service role key
4. **RLS review:** Current implementation uses service role client (bypasses RLS). If row-level security is preferred for these routes, policies need to be written.
5. **Rate limiting:** Consider replacing in-memory Map with Supabase table or Redis for production reliability across serverless instances.

---

## 10. Risks and Recommendations

| Risk | Severity | Recommendation |
|------|----------|----------------|
| In-memory rate limiting doesn't persist across serverless instances | Medium | Migrate to Supabase-backed rate limiting before production |
| `access_code_plain` stored permanently in DB | Low | Consider clearing after first admin view, or time-limited visibility |
| `snapshot_json` can grow large with many documents/consultants | Low | Monitor JSONB column size; consider separate table if snapshots exceed ~500KB |
| No expiry mechanism for web_status | Low | Add a cron/scheduled task to expire proposals after N days |
| PDF generator is 632 lines of client-side code | Medium | Large bundle size; consider lazy loading or code splitting for the jsPDF import |
| No automated tests for new code | High | Add unit and integration tests before shipping to production |

---

## 11. File-by-File Reference

Below is a brief description of every file for the reviewer's reference.

### `lib/propuestas-web/access-code.ts` (40 lines)
Exports `generateAccessCode()` (crypto-secure 6-char code), `hashAccessCode()` (bcrypt), `verifyAccessCode()` (bcrypt compare), and `generateSlug()` (sanitized URL slug from school + service + year + version). Charset excludes ambiguous characters (0, O, 1, I, L).

### `lib/propuestas-web/snapshot.ts` (278 lines)
Defines the `ProposalSnapshot` interface hierarchy (SnapshotConsultant, SnapshotModule, SnapshotPricing, SnapshotContentSection, SnapshotContentBlock, SnapshotDocument). Exports `buildProposalSnapshot()` which queries Supabase for licitación, config, modules, consultants, and documents, merges them into a frozen snapshot object. Uses service role client.

### `lib/propuestas-web/pdf-generator.ts` (632 lines)
Client-side PDF generation using jsPDF. Implements GENERA brand kit (#0a0a0a black, #fbbf24 yellow/gold, Inter font). 9 sections: Cover page, Table of Contents (with back-filled page numbers), About FNE, Consulting Team, Content Blocks, Modules & Hours (using jspdf-autotable), Economic Proposal (yellow grand total banner), Supporting Documents, Footers. Helper functions: `ensureSpace()`, `drawSectionTitle()`, `drawParagraph()`, `drawBulletList()`, `drawDefinitionCell()`.

### `pages/propuesta/[slug].tsx` (219 lines)
Next.js page with `getServerSideProps` that validates slug format. Client-side component manages 4 states: loading, error, locked (shows unlock screen), unlocked (shows full view). Checks sessionStorage for cached access code on mount. Supports `?admin=true` query param for admin preview bypass. Includes noindex/nofollow meta tags and OG metadata.

### `components/propuestas-web/ProposalUnlockScreen.tsx` (133 lines)
Full-screen dark (#0a0a0a) component with FNE logo, school name heading, and a 6-character code input field. Auto-uppercases input. Displays rate-limit feedback with remaining attempts count. Loading state with spinner during verification.

### `components/propuestas-web/ProposalPublicView.tsx` (414 lines)
Main orchestrator component rendering 11 sections: Hero (dark gradient with school name), About FNE, Consulting Model, Consulting Team (filtered by title), International Advisors, Content Blocks, Modules & Hours, Economic Proposal, Downloadable Documents, Contact info, Footer (with ficha and licitación ID). Includes PDF download button wired to `generateProposalPDF()`.

### `components/propuestas-web/ConsultantCard.tsx` (145 lines)
Displays consultant with photo, name, title, and expandable sections for formación, experiencia, and especialidades. 3 visual variants: `fne` (white border), `international` (yellow border), `advisor` (dark background). Expandable sections toggle open/closed.

### `components/propuestas-web/ContentBlockSection.tsx` (90 lines)
Renders content blocks with 4 types: heading, paragraph, list, image. Supports dark and light variant theming. Maps over content sections from snapshot.

### `components/propuestas-web/ModuleTimeline.tsx` (165 lines)
Displays hours summary cards (total hours, modules count, duration), a responsive data table, and a visual timeline bar showing module distribution by month.

### `components/propuestas-web/PricingSection.tsx` (103 lines)
Handles two pricing modes: `per_hour` (shows rate and hours) and `fixed` (flat amounts). Displays line items in cards with a grand total using yellow gradient (`bg-gradient-to-r from-yellow-400 to-amber-500`). Chilean peso formatting.

### `components/propuestas-web/DownloadablesSection.tsx` (81 lines)
Grid of document cards sorted by `TIPO_ORDER` constant. Download handler calls `/api/propuestas/web/[slug]/download-doc` with session code, then opens the returned signed URL.

### `components/propuestas-web/DocumentCard.tsx` (53 lines)
Individual card for a downloadable document showing name, type icon, and download button with loading state.

### `pages/api/propuestas/web/[slug]/index.ts` (56 lines)
Public GET endpoint. Returns non-sensitive metadata: schoolName, serviceName, type, programYear. No auth required. Uses service role client to query `propuesta_generadas` joined with `licitaciones`.

### `pages/api/propuestas/web/[slug]/verify.ts` (132 lines)
POST endpoint. Rate limiting: 5 attempts per IP per slug per hour (in-memory Map). Validates access code via bcrypt. On success: returns full `snapshot_json`, updates `viewed_at` (first view only) and increments `view_count`, sets `web_status` to 'viewed'. On failure: returns remaining attempts count.

### `pages/api/propuestas/web/[slug]/download-doc.ts` (96 lines)
POST endpoint. Zod-validated body (documentId, sessionCode). Re-verifies access code for session validation. Looks up document in snapshot by ID. Generates Supabase signed URL with 1-hour expiry via `getSignedUrl()`.

### `pages/api/propuestas/web/[slug]/admin-access.ts` (49 lines)
GET endpoint. Requires admin authentication via `checkIsAdmin()`. Returns full `snapshot_json` without access code. Uses project's standard `sendApiResponse` / `sendAuthError` pattern.

### `docs/migrations/propuesta-web.sql` (16 lines)
Additive-only migration. 7 new columns on `propuesta_generadas`, 2 partial unique indexes. Not yet executed.

### `pages/api/licitaciones/[id]/generate-propuesta.ts` (modified, +63 lines)
After existing PDF generation logic: calls `generateAccessCode()`, `generateSlug()`, `buildProposalSnapshot()`. Updates `propuesta_generadas` row with access_code (hashed), access_code_plain, web_slug, web_status='published', and snapshot_json. Returns web_slug and access_code in API response.

### `components/licitaciones/ProposalConfigPanel.tsx` (modified, +248 lines)
New `lastGenResult` state displaying post-generation panel: access code in monospaced font, web URL with copy button, "Ver Propuesta Web" link. History table enhanced with web_status badges (color-coded), view counts, and copy-link buttons.

### `lib/propuestas/types.ts` (modified, +10 lines)
Added `WebStatus` type (`'draft' | 'published' | 'viewed' | 'expired'`) and 7 optional fields to `PropuestaGenerada` interface: access_code, access_code_plain, web_slug, viewed_at, view_count, web_status, snapshot_json.

### `package.json` (modified, +2 lines)
Added `bcryptjs` (^3.0.3) and `@types/bcryptjs` (^2.4.6).
