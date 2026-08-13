# AGENTS.md — GENERA (FNE-LMS)

> Mirror of CLAUDE.md for Codex-family agents. If the two ever diverge, CLAUDE.md wins — fix the divergence in the same PR.
> Durable conventions HERE; evolving state in `PROJECT_STATE.md` (read first, update on phase end).

---

## Who Are You?

- **Cowork**: diagnose, plan, execute directly by default — no magic phrase required (Brent's global policy; enforced by the `bridge-mode-guard` hook). Post a Bridge task ONLY when Brent's current message explicitly selects the bridge/pipeline (e.g. "post this to bridge", "run this through the pipeline").
- **Claude Code / Codex**: execute tasks end-to-end. Run all quality gates before reporting complete.

Both: obey Hard Rules and read `PROJECT_STATE.md` before touching anything.

## Bridge Workflow (opt-in only — see above)

Preferred: MCP tools `bridge_post_task` / `bridge_wait_for_task` with `project='genera'` (available when the jake_bridge MCP is connected — check your tool list). Fallback on the host machine: `jb post ... --project genera`. Neither exists inside the Linux sandbox shell.

Task format: `{ "project": "genera", "task": "<what>", "context": "<files, root cause, suggested fix, DoD>" }`

## Commands

- `npm run dev` — dev server (pre-check script + 4GB heap)
- `npm run build` — production build
- `npm run type-check` — tsc --noEmit (8GB heap)
- `npm run lint` — ESLint, zero warnings allowed
- `npm run lint:testid` — advisory check: interactive elements need `data-testid` (see Testing)
- `npm test` — Vitest unit/integration (full run)
- `npm run test:db` — pgTAP RLS suite via `supabase test db` (requires Supabase CLI + Docker)
- `npm run e2e` — Playwright (testDir `tests/`, prod build + seeded synthetic tenant)

## CI — Four Gates (every PR)

`.github/workflows/ci.yml` runs: **(1) type-check, (2) unit (Vitest), (3) `supabase test db` (pgTAP/RLS), (4) Playwright e2e**. Plus a migration guard that fails the PR if any migration contains `DISABLE ROW LEVEL SECURITY`. A phase/task is not done if any gate is red. E2E uses `retries: 2` in CI.

## Executor Rules (Claude Code / Codex)

1. Feature branch ≤20 chars (e.g. `feat/assess`, `fix/auth-mid`) — long names break Vercel preview DNS
2. Make the changes
3. Quality gates before reporting: `npm run type-check && npm run lint && npm test && npm run build` (+ `test:db`/`e2e` when DB/UI touched)
4. Commit with a clear message; never merge to `main` yourself
5. Report back through the bridge. Never skip gates; fix failures first.
6. Before reporting a phase complete, write `docs/planning/reviews/fase-<N>-review-request.md` containing: branch + base SHA + commit count; the phase's objective and scope in/out (copied from the itinerary); files created/modified grouped by risk; test evidence (suite names + counts); the 3–5 areas an independent reviewer should scrutinize hardest, with one line each on why (your own judgment calls, shortcuts, or complexity hotspots — be honest, the reviewer will find them anyway); and known limitations or deferred items. Commit it with the phase. A phase without its review-request file is not complete. (Reviewer side: `docs/planning/review-protocol.md`.)

---

## Hard Rules

### NO DEPLOYMENTS
RED-tier. Never run `vercel`/`vercel --prod` or trigger Vercel CI. `main` auto-deploys — that is Brent's controlled path.

### Database Safety
- NEVER touch the production database directly
- NEVER `DROP`, `TRUNCATE`, or destructive `ALTER`; schema changes are additive only
- DB agent owns migrations — do not hand-write migration SQL outside that flow
- **Every table in `public` has RLS enabled.** A migration that disables RLS is blocked by a Claude Code hook (`scripts/hooks/block-rls-disable.sh` via `.claude/settings.json`) AND by CI. Do not work around them.
- RLS policies must be tested per role × table × operation (pgTAP matrix in `supabase/tests/`)

### Privacy — Ley 21.719 (Chile)
- Student data is legally protected PII; GENERA data is *sensitive* minor data
- Student PII never goes in AI prompts, commits, logs, or fixtures — synthetic data ONLY
- No new minor-data table without consent record + EIPD reference (hard gate = Fase 2)
- Sociogram surfaces are never exposed to student/family roles; asesor sees synthesis, leadership sees macro only

### Memory Discipline
Keep this file under 200 lines. Guardrails that MUST hold belong in hooks/CI, not prose.

---

## Project Context

### Architecture
- **Framework**: Next.js Pages Router with `getServerSideProps` (no App Router)
- **Language**: TypeScript strict
- **DB/Auth**: Supabase (dedicated instance), role-based access via `middleware.ts` — the most bug-prone area; extra scrutiny + per-role testing + session-invalidation checks on any change
- **Hosting**: Vercel (auto-deploy on push to `main`)
- **UI**: Tailwind 3 + shadcn/ui; must work on older school hardware (low-end browsers, small screens)
- **Data fetching**: raw `fetch()` in `getServerSideProps` and API routes — NOT TanStack Query or SWR
- **Language**: UI and all user-facing copy in Chilean Spanish (es-CL); code, comments, commits, migrations, and technical docs in English

### API Route Pattern (FOLLOW THIS)
```typescript
// auth → role check → validation → logic
export default async function handler(req, res) {
  const session = await getServerSession(req, res);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!hasRole(session.user, 'admin')) return res.status(403).json({ error: 'Forbidden' });
  // Validation → Business logic → Response
  return res.status(200).json({ data });
}
```

### Page Pattern (FOLLOW THIS)
```typescript
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res);
  if (!session) return { redirect: { destination: '/login', permanent: false } };
  const data = await fetchData(session.user);
  return { props: { data } };
};
```

### RBAC Roles (9 — source of truth: `types/roles.ts`)
`admin` (FNE global) · `consultor` (FNE consultants per school) · `equipo_directivo` (school admins) · `lider_generacion` · `lider_comunidad` · `supervisor_de_red` (network, reporting only) · `community_manager` · `docente` · `encargado_licitacion` (Ley SEP procurement)

GENERA phases (see itinerary + PROJECT_STATE.md) add 4 user types (asesor, estudiante, familia/apoderado, leadership/FNE macro). Mapping lands in Fase 1 — do not invent it early.

### Testing Conventions
- Unit/integration: Vitest (`__tests__/`, `tests/`; configs `vitest.config.ts`, `vitest.config.api.ts`)
- E2E: Playwright, selectors via `getByRole`/`getByTestId`; new interactive elements need `data-testid` (advisory lint: `npm run lint:testid` — becomes blocking once baseline is clean)
- RLS: pgTAP in `supabase/tests/` run by `supabase test db`; helpers `tests.rls_enabled`, `tests.create_supabase_user`, `tests.authenticate_as`. Blocked `INSERT` throws; blocked `UPDATE` returns empty — assert accordingly.
- Never `waitForTimeout`; use web-first assertions
