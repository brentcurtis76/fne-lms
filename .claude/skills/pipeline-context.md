# GENERA — Pipeline Context

## Architecture Overview
- Next.js 14.2 with Pages Router (NOT App Router)
- 206 API routes in pages/api/
- Supabase for Auth, Database, Storage (dedicated instance `sxlogxqzmarhqsblxmtj` — not shared)
- React Context for state management
- Raw fetch() for data fetching
- Tailwind CSS 3 for styling
- Only 2 shadcn/ui components — most UI is custom

## RBAC System — 7 Roles
1. **admin** — Full platform access, user management, system configuration
2. **director** — School-level management, teacher oversight, reports
3. **coordinador_academico** — Academic coordination, curriculum management
4. **coordinador_establecimiento** — Establishment-level coordination
5. **facilitador** — Workshop facilitation, activity management
6. **docente** — Teacher: assessments, student management, grading
7. **estudiante** — Student: view assignments, submit work, see grades

Every API route and page MUST check the user's role before granting access. Use the existing auth middleware pattern.

## API Route Pattern
```typescript
// pages/api/feature/action.ts
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

const schema = z.object({
  // Input validation schema
});

export default async function handler(req, res) {
  // 1. Auth check
  const supabase = createServerSupabaseClient({ req, res });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // 2. Role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!['admin', 'director'].includes(profile?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 3. Input validation
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  // 4. Business logic
  // ...

  // 5. Response
  return res.status(200).json({ data });
}
```

## Page Pattern (Pages Router)
```typescript
// pages/feature/index.tsx
import { GetServerSideProps } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = createServerSupabaseClient(ctx);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { redirect: { destination: '/login', permanent: false } };

  // Fetch data server-side
  const { data } = await supabase.from('table').select('*');

  return { props: { data } };
};

export default function FeaturePage({ data }) {
  // Client-side rendering with server-fetched data
}
```

## Assessment System Architecture
- Assessment types: diagnostic, formative, summative, self-evaluation
- Rubric builder: multi-criteria with proficiency levels
- AI analysis: Claude API for rubric-based feedback generation
- Progressive evaluation: track student growth over time
- Reports: PDF generation for school administrators

## Data Privacy Requirements (Law 21.719)
- **Lawful basis**: Educational necessity for data processing
- **Parental consent**: Required for minors' data. Stored in consent_records table.
- **Data minimization**: Only collect what's necessary for educational purposes
- **Right to access**: Parents/guardians can request all data about their child
- **Right to deletion**: Must support data deletion requests
- **DPIA**: Required for high-risk processing (AI analysis of student performance)
- **Synthetic data**: All development/testing uses fake data. NEVER real student records.

## AI Integration
- Claude API calls for rubric analysis and feedback
- API key stored in environment variables (NEVER in code)
- Prompts must NOT contain real student PII
- AI outputs must be reviewed before showing to users
- Rate limiting on AI-powered features

## Deployment
- Vercel (auto-deploys staging on branch push)
- Port 3000 required for local dev (Supabase auth cookie domain)
- Staging: branch deploys (feature/* branches)
- Production: main branch — MANUAL promotion only
- Database migrations: run via Supabase CLI, always additive
- **CRITICAL — Branch naming**: Branch names MUST be short (max 20 characters, e.g., `feat/lic-p6`, `fix/auth-bug`). Vercel preview URLs include the branch name in a subdomain, and DNS labels are capped at 63 characters. Long branch names like `feat/licitaciones-phase2-workflow` cause `ERR_NAME_NOT_RESOLVED` on the preview URL, breaking QA staging tests. Use abbreviations.

## Pipeline Flow (11 Steps — Zero Deferred Issues)
1. **PM** specs the task → `current-task.md`
2. **Architect** validates approach → `architect-review.md`
3. **DB agent** designs migration (if schema changes needed) → `db-report.md`
4. **Developer** implements application code (self-review checklist required) → `dev-report.md`
5. **Code Reviewer** reviews code quality, type safety, logic, tests → `code-review-report.md` (PASS → 6, FAIL → fix loop back to 4)
6. **Security** reviews code + migration SQL → `security-report.md` (PASS → 7, BLOCK → fix loop back to 4)
7. **UX Reviewer** checks UI (if applicable) → `ux-report.md` (PASS → 8, BLOCK → fix loop back to 4)
8. **Architect — Automated Gate**: reads upstream verdicts (Code Review, Security, UX). All must be PASS. Writes `gate-blocked.md` on block.
9. **Architect — Deploy**: on gate PASS, pushes migrations, deploys to staging → `staging-url.txt`
10. **QA** runs Playwright E2E tests against localhost + tests staging via browser → `qa-report.md`
11. **PM — Final Review**: reads ALL reports, all review agents must be PASS, decides SHIP IT / ITERATE / ESCALATE → `pm-final-verdict.md`

**Key design**: Every review agent (Code Review, Security, UX) that finds ANY issue sends the pipeline back to the Developer to fix it. The review re-runs to verify. No issues are deferred to backlogs or follow-up tasks. The pipeline ships clean or it doesn't ship.

## QA Test Accounts

**CRITICAL: Read `docs/qa-system/TEST_ACCOUNTS.md` before any browser-based QA testing.** It contains all test user credentials, user IDs, school IDs, and community IDs.

Key accounts:
- **Admin:** `admin.qa@fne.cl` (password in TEST_ACCOUNTS.md)
- **Consultant:** `consultor.qa@fne.cl` — School: QA Test School (ID: 257)
- **Community leader:** `lider.qa@fne.cl` — Community: QA Test Community (ID: `3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd`)
- **Docente:** `docente.qa@fne.cl` — School: QA Test School (ID: 257)
- Full list of 12 accounts in `docs/qa-system/TEST_ACCOUNTS.md`

Additional QA reference: `docs/qa-system/GUIA_QA_TESTER.docx` (Spanish-language tester guide)

## Quality Commands
- `npx tsc --noEmit` — TypeScript check
- `npm run lint` — ESLint
- `npm test` — Vitest (14 existing test files)
- `npm run build` — Next.js production build
- `npx playwright test --reporter=list` — Playwright E2E tests (runs against localhost via webServer config)

ALL four quality commands must pass before ANY task is reported complete. Playwright E2E tests are mandatory for the QA agent (see `pipeline-qa.md` Step 2) — pre-existing failures in unrelated specs don't block, but feature-related failures do.
