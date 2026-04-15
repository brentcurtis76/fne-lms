> **CRITICAL — READ FIRST:** No bridge MCP exists in this session. Never search for `bridge_post_task` or similar tools. Use `jb post ... --project genera` via the bash tool. See Claude Code section below.

# GENERA (FNE-LMS) — Project Rules

> Learning management system for Fundación Nueva Educación.
> Next.js (Pages Router) + TypeScript + Tailwind/shadcn + Supabase.

---

## Who Are You?

If you are **Cowork**: you diagnose, plan, and delegate. You do NOT edit files. Read the Cowork section below.

If you are **Claude Code**: you execute tasks. Read the Claude Code section below.

Both: read Hard Rules and Project Context regardless.

---

## Cowork Rules

**You do NOT edit files in this project. EVER.**

All code changes, bug fixes, refactors — including one-line fixes — go through `bridge_post_task` with `project='genera'`.

Your job:
1. Investigate the issue (read files, check logs, trace the bug)
2. Describe the root cause and the fix clearly
3. Post it via `bridge_post_task` with enough context for Claude Code to execute
4. Follow up with `bridge_wait_for_task` and report the result

You may READ any file for diagnosis. You may NOT write, edit, or create files.

### Bridge Task Format

```json
{
  "project": "genera",
  "task": "<what to do>",
  "context": "<relevant files, root cause, suggested fix>"
}
```

---

## Claude Code Rules

When executing a task:
1. Create a feature branch (≤20 chars, e.g. `fix/auth-mid`)
2. Make the changes
3. Run ALL quality gates before reporting complete:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - `npm run build`
4. Commit with a clear message
5. Report result back through the bridge

If any quality gate fails, fix the issue before reporting complete. Never skip gates.

---

## Hard Rules

### NO DEPLOYMENTS
Deployments are RED-tier. Do not run `vercel`, `vercel --prod`, or trigger Vercel CI. Refuse clearly. The user deploys manually or through a controlled process.

### Database Safety
- NEVER touch production database directly
- NEVER run `DROP`, `TRUNCATE`, or destructive `ALTER`
- Schema changes must be additive only
- DB agent owns all migrations — do not write migration SQL directly
- Supabase RLS policies must be verified against ALL user roles

### Privacy — Law 21.719 (Chile)
- Student data is legally protected PII
- Student PII never goes in AI prompts, commits, logs, or Open Brain
- Synthetic data ONLY for development/testing — NEVER real student records
- Parental consent workflows must respect legal guardianship

### Branch Naming
- Keep ≤20 characters (e.g., `feat/assess`, `fix/auth-mid`)
- Vercel preview URLs include the branch name — long names cause DNS failures

---

## Project Context

### Architecture
- **Framework**: Next.js (Pages Router with `getServerSideProps`)
- **Language**: TypeScript strict mode
- **Database**: Supabase (dedicated instance)
- **Auth**: Supabase Auth with role-based access via middleware
- **Hosting**: Vercel (auto-deploys on push to `main`)
- **UI**: Tailwind 3, shadcn/ui (2 components currently)
- **Testing**: Vitest

### API Route Pattern (FOLLOW THIS)
```typescript
// Every API route follows: auth → role check → validation → logic
export default async function handler(req, res) {
  const session = await getServerSession(req, res);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  // Role check
  if (!hasRole(session.user, 'admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

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

### RBAC Roles (4)
- **Docente (Teacher)** — Manages own classes, views student records
- **Estudiante (Student)** — Views own records, completes assignments
- **Admin** — Full platform access, user management
- **Apoderado (Guardian)** — Views student progress, manages consent

Auth middleware is the most bug-prone area — extra scrutiny on any changes. RLS policies must be tested per-role.

### Key Notes
- Auth/RBAC changes are where bugs hide — always check middleware and session invalidation
- Data fetching uses raw `fetch()` in `getServerSideProps` and API routes (NOT TanStack Query or SWR)
- Accessibility: must work on older school hardware (lower-end browsers, smaller screens)
