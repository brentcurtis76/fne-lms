# AGENTS.md — GENERA (FNE-LMS)

> Mirror of CLAUDE.md for Codex-family agents. If the two ever diverge, CLAUDE.md wins — fix the divergence in the same PR.
> Durable conventions HERE; evolving state in `PROJECT_STATE.md` (read first, update on phase end).

## Project

Learning platform for Fundación Nueva Educación. Next.js **Pages Router** (`getServerSideProps`, no App Router) + TypeScript strict + Tailwind 3/shadcn + Supabase (dedicated instance). Hosted on Vercel; `main` auto-deploys. Data fetching is raw `fetch()` — no TanStack Query, no SWR. Must run on older school hardware.

**Language**: UI and all user-facing copy in Chilean Spanish (es-CL); code, comments, commits, migrations, and technical docs in English.

## Commands

- `npm run dev` / `npm run build`
- `npm run type-check` — tsc --noEmit (8GB heap)
- `npm run lint` — zero warnings allowed
- `npm run lint:testid` — advisory: interactive elements need `data-testid`
- `npm test` — Vitest unit/integration
- `npm run test:db` — pgTAP RLS suite via `supabase test db` (Supabase CLI + Docker)
- `npm run e2e` — Playwright (testDir `tests/`)

## CI — Four Gates (every PR)

`.github/workflows/ci.yml`: (1) type-check, (2) unit, (3) `supabase test db`, (4) Playwright. Plus a guard failing any PR whose migrations contain `DISABLE ROW LEVEL SECURITY`. Red gate = task not done. E2E `retries: 2` in CI.

## Execution Rules

1. Feature branch **≤20 chars** (`feat/assess`, `fix/auth-mid`) — long names break Vercel preview DNS
2. Make changes; follow the API/page patterns below
3. Gates before reporting complete: `npm run type-check && npm run lint && npm test && npm run build` (+ `test:db`/`e2e` when DB/UI touched)
4. Clear commit message; never merge to `main` yourself; never skip gates

## Hard Rules

- **NO DEPLOYMENTS** (never `vercel`/`vercel --prod`; `main` auto-deploy is the only path, controlled by Brent)
- **DB safety**: never touch prod DB directly; never `DROP`/`TRUNCATE`/destructive `ALTER`; additive schema only; migrations belong to the DB agent flow
- **RLS**: every `public` table has RLS enabled. Migrations disabling RLS are blocked by hook (`scripts/hooks/block-rls-disable.sh`) and CI — do not bypass. Test policies per role × table × operation (pgTAP in `supabase/tests/`).
- **Privacy (Ley 21.719)**: student data = sensitive minor PII. Never in prompts, commits, logs, fixtures. Synthetic data only. No new minor-data table without consent record + EIPD reference (gate = Fase 2). Sociogram never visible to student/family roles.

## Patterns

```typescript
// API route: auth → role check → validation → logic
export default async function handler(req, res) {
  const session = await getServerSession(req, res);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!hasRole(session.user, 'admin')) return res.status(403).json({ error: 'Forbidden' });
  return res.status(200).json({ data });
}
```

```typescript
// Page: session-gated getServerSideProps
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res);
  if (!session) return { redirect: { destination: '/login', permanent: false } };
  const data = await fetchData(session.user);
  return { props: { data } };
};
```

## RBAC Roles (9 — source of truth: `types/roles.ts`)

`admin`, `consultor`, `equipo_directivo`, `lider_generacion`, `lider_comunidad`, `supervisor_de_red`, `community_manager`, `docente`, `encargado_licitacion`. GENERA phases add 4 user types later (asesor, estudiante, familia, leadership) — mapping lands in Fase 1, do not invent it early.

## Testing Conventions

Vitest for unit/integration (`__tests__/`, `tests/`); Playwright e2e with `getByRole`/`getByTestId` (new interactive elements need `data-testid`); pgTAP RLS suites in `supabase/tests/` via `supabase test db` (helpers: `tests.rls_enabled`, `tests.create_supabase_user`, `tests.authenticate_as`; blocked INSERT throws, blocked UPDATE returns empty). Never `waitForTimeout`.

## Auth Middleware Warning

`middleware.ts` + RBAC is the most bug-prone area of the codebase. Any change there requires per-role testing and session-invalidation checks.
