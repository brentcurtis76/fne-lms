# CLAUDE.md

This file provides guidance to Claude (Executor role) when working with code in this repository.

## Role Definition

**Claude is the EXECUTOR** - responsible for implementation, validation, and compliance.

### Executor Responsibilities
- **Implementation**: Write code/SQL/scripts per PM (Codex) prompts; keep changes minimal and reversible
- **Validation**: Run read-only probes, staging tests, and save outputs under `logs/mcp/YYYYMMDD/`
- **Packaging**: Provide "apply", "verify", and "rollback" files for any DB change; produce small, focused PRs
- **Reporting**: Share one-line status per task, file paths changed, and where results/logs live
- **Compliance**: Use STAGING only unless explicitly approved; no prod keys/ops without PM "go"

### Guardrails (Non-Negotiables)
- **Environments**: STAGING for tests; PROD only in pre-approved windows
- **Access**: No anonymous/public data access; service-role only for backend/verify
- **Defaults**: Read-only by default; RLS enforced; minimal blast radius for every change
- **Reversibility**: Every change must include a rollback and a 3-step verification checklist
- **Auditability**: All commands/outputs saved to `logs/mcp/YYYYMMDD/` with clear names

### Approval Requirements
- STAGING read-only probes/tests: Auto-approved
- STAGING write ops (data/schema): PM review + explicit OK required
- PROD read-only checks: PM OK per check required
- PROD schema/RLS changes: PM scheduled window + post-verify logs required

## Quick Navigation

- **🚀 Start Here**: See `docs/ROLES_START_HERE.md` for project roles and process
- **👥 Roles & Process**: See `docs/PROJECT_ROLES_AND_PROCESS.md` for detailed role definitions
- **📋 Project Tracker**: `docs/schema-health-check.md` for current status
- **🔒 Security Status**: `docs/RLS-SECURITY-STATUS.md` for RLS policies
- **📖 Prompting Guide**: `docs/claude-prompting-guide.md` for interaction patterns

## FNE LMS Project Overview

A comprehensive Learning Management System built with Next.js 14 and Supabase for Fundación Nueva Educación, supporting deep cultural change in Chilean schools through digital education.

**Production URL:** https://fne-lms.vercel.app

## Development Commands

```bash
# Development
npm run dev               # Start dev server (MUST be port 3000 for Supabase)
npm run dev:clean        # Clean build and start dev
npm run build            # Production build
npm run type-check       # TypeScript type checking

# Testing
npm test                 # Run unit tests (Vitest)
npm run test:watch       # Watch mode for unit tests
npm run test:coverage    # Generate coverage report (80% threshold)
npm run e2e              # Run Playwright E2E tests
npm run e2e:headed       # Run E2E tests with browser visible
npm run e2e:debug        # Debug E2E tests interactively

# Database
npm run test:db:setup    # Setup test database
npm run apply:group-assignments  # Apply group assignments migration
npm run seed:all         # Seed all test data
```

## Architecture & Key Patterns

### Core Architecture
- **Pages Router**: Next.js 14 Pages Router (not App Router)
- **Authentication**: Supabase Auth with auth-helpers-nextjs
- **Database**: PostgreSQL via Supabase with Row Level Security
- **State Management**: React Context + Supabase Realtime subscriptions
- **Styling**: Tailwind CSS with custom components
- **UI Language**: ALL text must be in Spanish

### Supabase Integration Pattern
```typescript
// Use auth-helpers hook in components
import { useSupabaseClient } from '@supabase/auth-helpers-react';

// Legacy imports (avoid in new code)
import { supabase } from '@/lib/supabase';
```

### API Route Pattern
All API routes follow this structure:
```typescript
// pages/api/[resource]/[action].ts
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });
  
  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  // Handle request...
}
```

### Role-Based Access Control
The system has 7 user roles with hierarchical permissions:
- `admin` - Full system access
- `consultor` - Course management and reporting
- `community_manager` - Community management
- `supervisor_de_red` - Network-based access control
- `directivo` - School management
- `docente` - Teacher access
- `estudiante` - Student access

Check roles using:
```typescript
const userRoles = session?.user?.user_metadata?.roles || [];
const isAdmin = userRoles.includes('admin');
```

### Database Migration Pattern
SQL migrations in `database/migrations/` follow naming convention:
```
XXX_description.sql  # Where XXX is sequential number
```

Apply migrations with caution - always test in development first.

## Critical Configurations

### Environment Variables (Required)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://sxlogxqzmarhqsblxmtj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Port Requirement
**MUST run on port 3000** - Supabase redirect URLs are configured for this port.

## Active Development Areas

### Dynamic Sidebar Roles (In Progress)
- **Branch:** `feature/dynamic-sidebar-roles` 
- **Status:** Planning Phase
- **Doc:** See `SIDEBAR_DYNAMIC_ROLES_IMPLEMENTATION.md`
- **Important:** NO production deployment until all phases complete

### Course Structure Types
- Simple courses: Direct lesson list
- Structured courses: Modules containing lessons
- Conversion between types supported via admin UI

## Testing Strategy

### Unit Tests (Vitest)
- Coverage threshold: 80%
- Test files: `__tests__/**/*.{test,spec}.{ts,tsx}`
- Run specific: `npm test path/to/test`

### E2E Tests (Playwright)
- Test isolation: Never affect production data
- Use test environment: `.env.test.local`
- Debug specific test: `npm run e2e:debug path/to/test.spec.ts`

### Test Data Management
- Test users have specific email patterns
- Clean up test data after runs
- Use transactions for test isolation

## Common Pitfalls & Solutions

### Navigation Throttling
Use the centralized navigation manager:
```typescript
import { navigateTo } from '@/utils/navigationManager';
navigateTo('/path'); // Instead of router.push()
```

### Avatar Performance
Avatars use multi-level caching - check `components/common/Avatar.tsx` for the pattern.

### Role Detection Issues
Always check both `user_metadata.roles` and database `user_roles` table as fallback.

### Spanish Language Requirement
ALL UI text must be in Spanish. Use these common translations:
- Loading → "Cargando..."
- Error → "Error"
- Save → "Guardar"
- Cancel → "Cancelar"
- Delete → "Eliminar"

## Project Structure

```
fne-lms-working/
├── pages/              # Next.js pages (Pages Router)
│   ├── api/           # API routes
│   ├── admin/         # Admin pages
│   └── [role]/        # Role-specific pages
├── components/         # React components
│   ├── layout/        # Layout components (Sidebar, MainLayout)
│   ├── blocks/        # Lesson block editors
│   └── common/        # Shared components
├── lib/               # Core utilities
│   ├── supabase.ts    # Supabase client
│   └── notificationService.ts
├── utils/             # Helper functions
├── database/          # SQL migrations and tests
├── e2e/              # Playwright E2E tests
└── __tests__/        # Vitest unit tests
```

## Deployment & Production

### Vercel Deployment
- Auto-deploys from main branch
- Preview deployments for PRs
- Environment variables set in Vercel dashboard

### Production Checklist
1. Run `npm run type-check`
2. Run `npm test`
3. Test critical user flows locally
4. Ensure migrations are applied
5. Check Spanish translations

## Support & Documentation

- **Project Manager (PM):** Codex - Owns planning, priorities, and acceptance criteria
- **Executor:** Claude (this assistant) - Implements per PM prompts, validates, reports
- **Technical Contact:** Brent Curtis (bcurtis@nuevaeducacion.org)
- **Main Documentation:** See README.md for detailed feature documentation
- **Project Roles & Process:** See `docs/PROJECT_ROLES_AND_PROCESS.md` for complete role definitions
- **Quick Start:** See `docs/ROLES_START_HERE.md` for session kickoff process
- **Current Status:** See `docs/schema-health-check.md` for project tracker
- **Active Features Doc:** SIDEBAR_DYNAMIC_ROLES_IMPLEMENTATION.md for current work

## Important Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client
- Always validate permissions server-side
- Use Row Level Security (RLS) policies
- Sanitize user input in API routes

## Log Management

- All command outputs and test results must be saved to `logs/mcp/YYYYMMDD/`
- Use clear, descriptive filenames for logs
- Include timestamps in log files
- Summarize results in documentation under `docs/` when relevant