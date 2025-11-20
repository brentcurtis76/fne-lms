# Supabase SSR Migration Plan

**Created**: November 20, 2025
**Status**: Planned (Not Started)
**Priority**: Medium (Schedule for Q1 2026)
**Estimated Effort**: 3-4 days focused work

---

## Overview

Migrate from deprecated `@supabase/auth-helpers-*` packages to the new `@supabase/ssr` package. This is a comprehensive migration affecting authentication across the entire application.

**Deprecation Warnings**:
```
npm warn deprecated @supabase/auth-helpers-nextjs@0.10.0
npm warn deprecated @supabase/auth-helpers-react@0.5.0
npm warn deprecated @supabase/auth-helpers-shared@0.7.0
```

---

## Migration Scope

### Impact Analysis
- **Total Files Affected**: 216 files
- **File Breakdown**:
  - API Routes: ~50 files
  - Admin Pages: ~30 files
  - Regular Pages: ~40 files
  - Components: ~80 files
  - Test Files: ~16 files

### Packages to Change
**Remove**:
- `@supabase/auth-helpers-nextjs` v0.10.0
- `@supabase/auth-helpers-react` v0.5.0
- `@supabase/auth-helpers-shared` v0.7.0

**Add**:
- `@supabase/ssr` (latest version)

### Risk Assessment
- **Risk Level**: MEDIUM-HIGH
- **Reason**: Affects core authentication system
- **Mitigation**: Comprehensive testing, gradual rollout, rollback plan

---

## Prerequisites

Before starting migration:

1. **Comprehensive Test Suite**
   - [ ] All authentication flows have E2E tests
   - [ ] Unit tests cover auth utilities
   - [ ] Integration tests for API routes

2. **Backup & Rollback Plan**
   - [ ] Create migration branch: `feature/migrate-supabase-ssr`
   - [ ] Document current working state
   - [ ] Test rollback procedure

3. **Team Availability**
   - [ ] Allocate 3-4 consecutive days
   - [ ] Ensure developer availability for testing
   - [ ] Schedule during low-traffic period

---

## Phase 1: Setup & Preparation (Day 1 Morning - 2 hours)

### 1.1 Create Migration Branch
```bash
git checkout -b feature/migrate-supabase-ssr
git push -u origin feature/migrate-supabase-ssr
```

### 1.2 Install New Package (Keep Old for Now)
```bash
npm install @supabase/ssr@latest
# DO NOT uninstall old packages yet - gradual migration
```

### 1.3 Create New Utility Files

**File**: `lib/supabase/server.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import type { NextApiRequest, NextApiResponse } from 'next'

export function createClient(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies[name]
        },
        set(name: string, value: string, options: any) {
          const cookieString = `${name}=${value}; ${Object.entries(options)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ')}`
          res.setHeader('Set-Cookie', cookieString)
        },
        remove(name: string, options: any) {
          res.setHeader('Set-Cookie', `${name}=; Max-Age=0`)
        }
      }
    }
  )
}
```

**File**: `lib/supabase/browser.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### 1.4 Document Current State
```bash
# Count files using old packages
grep -r "from '@supabase/auth-helpers" --include="*.ts" --include="*.tsx" | wc -l
# Output: 216 files

# List all affected files
grep -r "from '@supabase/auth-helpers" --include="*.ts" --include="*.tsx" -l > migration-files.txt
```

---

## Phase 2: Migrate Core Authentication (Day 1 Afternoon - 4 hours)

### 2.1 Update AuthContext (CRITICAL)

**File**: `contexts/AuthContext.tsx`

**Current Pattern** (OLD):
```typescript
import { useSupabaseClient, useSession, useUser } from '@supabase/auth-helpers-react'

const supabase = useSupabaseClient()
const session = useSession()
const user = useUser()
```

**New Pattern**:
```typescript
import { createClient } from '@/lib/supabase/browser'
import { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext<{
  session: Session | null
  user: User | null
  supabase: ReturnType<typeof createClient>
}>({ session: null, user: null, supabase: null as any })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <AuthContext.Provider value={{ session, user, supabase }}>
      {children}
    </AuthContext.Provider>
  )
}

// Backward-compatible hooks
export const useAuth = () => useContext(AuthContext)
export const useSupabaseClient = () => useAuth().supabase
export const useSession = () => useAuth().session
export const useUser = () => useAuth().user
```

### 2.2 Update _app.tsx

**File**: `pages/_app.tsx`

**OLD**:
```typescript
import { SessionContextProvider } from '@supabase/auth-helpers-react'
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs'

function MyApp({ Component, pageProps }) {
  const [supabase] = useState(() => createBrowserSupabaseClient())

  return (
    <SessionContextProvider supabaseClient={supabase}>
      <Component {...pageProps} />
    </SessionContextProvider>
  )
}
```

**NEW**:
```typescript
import { AuthProvider } from '@/contexts/AuthContext'

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  )
}
```

### 2.3 Test Core Authentication
```bash
npm run dev
# Test:
# - Login flow
# - Logout flow
# - Session persistence
# - Protected page redirects
```

---

## Phase 3: Migrate API Routes (Day 2 Morning - 4 hours)

### 3.1 Migration Pattern for API Routes

**OLD** (`pages/api/**/*.ts`):
```typescript
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ... rest of handler
}
```

**NEW**:
```typescript
import { createClient } from '@/lib/supabase/server'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ... rest of handler (SAME!)
}
```

### 3.2 Batch Migration Commands

```bash
# Replace import statements in API routes
find pages/api -name "*.ts" -type f -exec sed -i.bak \
  "s/from '@supabase\/auth-helpers-nextjs'/from '@\/lib\/supabase\/server'/g" {} \;

# Replace createPagesServerClient calls
find pages/api -name "*.ts" -type f -exec sed -i.bak \
  "s/createPagesServerClient({ req, res })/createClient(req, res)/g" {} \;

# Remove backup files after verification
find pages/api -name "*.bak" -delete
```

**⚠️ CRITICAL**: Review each file manually after automated replacement!

### 3.3 Priority API Routes (Migrate First)
1. `pages/api/auth/*.ts` - Authentication endpoints
2. `pages/api/admin/*.ts` - Admin operations
3. `pages/api/assignments/*.ts` - Assignment management
4. `pages/api/reports/*.ts` - Reporting
5. All remaining API routes

### 3.4 Test Each Batch
```bash
# After each batch:
npm run type-check
npm run test:api
npm run dev

# Manual test critical endpoints:
curl -X POST http://localhost:3000/api/auth/session \
  -H "Cookie: sb-access-token=..."
```

---

## Phase 4: Migrate Pages (Day 2 Afternoon - 4 hours)

### 4.1 Migration Pattern for Pages

**OLD** (`pages/*.tsx`):
```typescript
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react'

export default function MyPage() {
  const supabase = useSupabaseClient()
  const session = useSession()

  // ... component logic
}
```

**NEW** (No change needed if using custom hooks!):
```typescript
import { useSupabaseClient, useSession } from '@/contexts/AuthContext'

export default function MyPage() {
  const supabase = useSupabaseClient()
  const session = useSession()

  // ... component logic (SAME!)
}
```

### 4.2 Batch Migration by Directory

**Priority Order**:
1. Auth pages: `pages/login.tsx`, `pages/reset-password.tsx`
2. Admin pages: `pages/admin/**/*.tsx` (~30 files)
3. Student pages: `pages/student/**/*.tsx`
4. Regular pages: `pages/*.tsx`

### 4.3 Automated Import Updates
```bash
# Update imports in pages
find pages -name "*.tsx" -type f -exec sed -i.bak \
  "s/from '@supabase\/auth-helpers-react'/from '@\/contexts\/AuthContext'/g" {} \;

# Verify no remaining old imports
grep -r "@supabase/auth-helpers-react" pages/
```

---

## Phase 5: Migrate Components (Day 3 Morning - 3 hours)

### 5.1 Component Categories

**Admin Components** (`components/admin/**/*.tsx`):
- Priority: HIGH (40+ files)
- Pattern: Same as pages

**Layout Components** (`components/layout/**/*.tsx`):
- Priority: CRITICAL (affects all pages)
- Files: Sidebar.tsx, MainLayout.tsx

**Feature Components** (`components/**/*.tsx`):
- Priority: MEDIUM (remaining ~40 files)

### 5.2 Migration Commands
```bash
# Update all component imports
find components -name "*.tsx" -type f -exec sed -i.bak \
  "s/from '@supabase\/auth-helpers-react'/from '@\/contexts\/AuthContext'/g" {} \;

# Verify
grep -r "@supabase/auth-helpers" components/
```

---

## Phase 6: Migrate Utilities & Services (Day 3 Afternoon - 2 hours)

### 6.1 Update Shared Utilities

**Files**:
- `utils/authHelpers.ts`
- `lib/frontend-auth-utils.ts`
- `lib/api-auth.ts`
- `lib/supabase-wrapper.ts`

**Pattern**: Update imports, replace with new patterns from above

### 6.2 Update Test Files

**Files**: `__tests__/**/*.tsx` (~16 files)

**OLD**:
```typescript
import { SessionContextProvider } from '@supabase/auth-helpers-react'

const wrapper = ({ children }) => (
  <SessionContextProvider supabaseClient={mockSupabase}>
    {children}
  </SessionContextProvider>
)
```

**NEW**:
```typescript
import { AuthProvider } from '@/contexts/AuthContext'

const wrapper = ({ children }) => (
  <AuthProvider>
    {children}
  </AuthProvider>
)
```

---

## Phase 7: Testing & Validation (Day 3 Afternoon - 3 hours)

### 7.1 Comprehensive Test Checklist

**Authentication Flows**:
- [ ] Login with email/password
- [ ] Logout
- [ ] Password reset
- [ ] Session persistence across page reloads
- [ ] Session expiration handling
- [ ] Magic link authentication (if used)

**Protected Routes**:
- [ ] Unauthenticated user redirects to login
- [ ] Role-based access control works
- [ ] Admin pages require admin role
- [ ] Student pages accessible to students

**API Routes**:
- [ ] API routes require authentication
- [ ] API routes respect user roles
- [ ] Session validation in API routes
- [ ] CRUD operations work correctly

**Edge Cases**:
- [ ] Multiple tabs/windows
- [ ] Concurrent sessions
- [ ] Token refresh
- [ ] Network failures

### 7.2 Automated Testing
```bash
# Type checking
npm run type-check

# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests (CRITICAL)
npm run e2e

# API tests
npm run test:api
```

### 7.3 Manual Testing Checklist

Create test user accounts for each role:
- Admin user
- Consultor user
- Docente user
- Estudiante user

Test each critical flow:
1. Login → Dashboard → Logout
2. Create assignment (admin) → View assignment (student)
3. Submit assignment (student) → Review submission (admin)
4. Access reports (admin only)
5. Course enrollment and progress tracking

---

## Phase 8: Cleanup & Deployment (Day 4 - 2 hours)

### 8.1 Remove Old Packages
```bash
# Only after ALL tests pass!
npm uninstall @supabase/auth-helpers-nextjs \
              @supabase/auth-helpers-react \
              @supabase/auth-helpers-shared

# Verify no lingering imports
grep -r "@supabase/auth-helpers" . --exclude-dir=node_modules --exclude-dir=.git
```

### 8.2 Update Documentation
- [ ] Update README.md
- [ ] Update architecture documentation
- [ ] Update onboarding docs for new developers
- [ ] Add migration completion notes

### 8.3 Final Verification
```bash
# Clean build
rm -rf .next node_modules
npm install
npm run build

# Verify build output
npm run type-check
```

### 8.4 Deployment Process

**Staging Deployment**:
```bash
git push origin feature/migrate-supabase-ssr

# Deploy to staging (if available)
vercel --env=staging

# Test staging thoroughly for 24 hours
```

**Production Deployment**:
```bash
# Merge to main
git checkout main
git merge feature/migrate-supabase-ssr
git push origin main

# Vercel auto-deploys
# Monitor logs for 1 hour post-deployment
```

---

## Rollback Plan

### If Critical Issues Arise

**Immediate Rollback** (< 1 hour):
```bash
# Revert deployment
vercel rollback

# Or revert code
git revert <migration-commit-hash>
git push origin main
```

**Code Rollback** (if major issues):
```bash
# Delete branch
git branch -D feature/migrate-supabase-ssr

# Reinstall old packages
npm install @supabase/auth-helpers-nextjs@^0.10.0 \
            @supabase/auth-helpers-react@^0.5.0

# Deploy previous version
git checkout main
vercel --prod
```

---

## Common Migration Patterns Reference

### Pattern 1: Client Component with Auth
**Before**:
```typescript
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react'

export function MyComponent() {
  const supabase = useSupabaseClient()
  const user = useUser()

  const handleClick = async () => {
    const { data } = await supabase.from('table').select()
  }
}
```

**After**:
```typescript
import { useSupabaseClient, useUser } from '@/contexts/AuthContext'

export function MyComponent() {
  const supabase = useSupabaseClient()
  const user = useUser()

  const handleClick = async () => {
    const { data } = await supabase.from('table').select()
  }
}
```

**Change**: Only import path changes!

### Pattern 2: API Route
**Before**:
```typescript
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req, res) {
  const supabase = createPagesServerClient({ req, res })
  // ... rest
}
```

**After**:
```typescript
import { createClient } from '@/lib/supabase/server'

export default async function handler(req, res) {
  const supabase = createClient(req, res)
  // ... rest (SAME API!)
}
```

### Pattern 3: Protected Page
**Before**:
```typescript
import { useSession } from '@supabase/auth-helpers-react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ProtectedPage() {
  const session = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!session) {
      router.push('/login')
    }
  }, [session, router])
}
```

**After**:
```typescript
import { useSession } from '@/contexts/AuthContext'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ProtectedPage() {
  const session = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!session) {
      router.push('/login')
    }
  }, [session, router])
}
```

**Change**: Only import path!

---

## Performance Considerations

### Before Migration
- Document current page load times
- Measure authentication latency
- Record API response times

### After Migration
- Compare metrics
- Expected: Same or better performance
- SSR package is optimized for Next.js

### Monitoring
```bash
# Check bundle size
npm run build
# Compare .next/static/ sizes before/after

# Performance testing
npx lighthouse http://localhost:3000/login
npx lighthouse http://localhost:3000/dashboard
```

---

## Troubleshooting Guide

### Issue: "createClient is not a function"
**Cause**: Import path incorrect
**Fix**: Ensure using `@/lib/supabase/server` or `@/lib/supabase/browser`

### Issue: "Session is null after login"
**Cause**: Auth state not updating
**Fix**: Check AuthContext.tsx useEffect dependencies

### Issue: API routes return 401
**Cause**: Cookie handling incorrect
**Fix**: Verify cookie middleware in server.ts

### Issue: TypeScript errors
**Cause**: Type mismatch between old/new packages
**Fix**:
```bash
rm -rf node_modules .next
npm install
npm run type-check
```

### Issue: Tests failing
**Cause**: Mock setup outdated
**Fix**: Update test utilities to use new AuthProvider

---

## Success Criteria

Migration is complete when:

- [ ] All 216 files migrated
- [ ] Zero references to old packages in codebase
- [ ] All TypeScript checks pass
- [ ] All unit tests pass (100%)
- [ ] All integration tests pass (100%)
- [ ] All E2E tests pass (100%)
- [ ] Manual testing completed for all roles
- [ ] Staging deployment stable for 24 hours
- [ ] Production deployment successful
- [ ] No authentication-related errors in logs for 48 hours
- [ ] Old packages uninstalled
- [ ] Documentation updated

---

## Timeline Summary

| Phase | Duration | Effort |
|-------|----------|--------|
| **Phase 1: Setup** | 2 hours | Low |
| **Phase 2: Core Auth** | 4 hours | High |
| **Phase 3: API Routes** | 4 hours | Medium |
| **Phase 4: Pages** | 4 hours | Medium |
| **Phase 5: Components** | 3 hours | Medium |
| **Phase 6: Utilities** | 2 hours | Low |
| **Phase 7: Testing** | 6 hours | High |
| **Phase 8: Cleanup** | 2 hours | Low |
| **Total** | **27 hours** | **3.5 days** |

**Recommended Schedule**: 4 consecutive days with buffer time

---

## Resources

### Official Documentation
- Supabase SSR Guide: https://supabase.com/docs/guides/auth/server-side-rendering
- Migration Guide: https://supabase.com/docs/guides/auth/server-side/migrating-to-ssr-from-auth-helpers
- Next.js Integration: https://supabase.com/docs/guides/auth/server-side/nextjs

### Internal Documentation
- Architecture Overview: `README.md`
- Authentication Flow: (create if needed)
- API Authentication: (create if needed)

### Community Resources
- Supabase Discord: https://discord.supabase.com
- GitHub Issues: https://github.com/supabase/supabase/issues
- Stack Overflow: Tag `supabase`

---

## Post-Migration Monitoring

### Week 1: Intensive Monitoring
- Check error logs daily
- Monitor authentication success rate
- Track API response times
- User feedback collection

### Week 2-4: Standard Monitoring
- Weekly log review
- Performance metrics
- User complaint tracking

### Long-term: Normal Operations
- Monthly dependency updates
- Quarterly security review
- Annual architecture review

---

## Contact & Support

**Migration Lead**: TBD (assign when scheduling)
**Backup Developer**: TBD
**Technical Lead**: Brent Curtis (bcurtis@nuevaeducacion.org)

**Questions?**
- Review this document first
- Check official Supabase docs
- Post in team Slack channel
- Contact technical lead if blocked

---

## Version History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-20 | 1.0 | Claude Code | Initial migration plan created |
| | | | Documented all 8 phases |
| | | | Added rollback procedures |

---

**Last Updated**: November 20, 2025
**Next Review**: When scheduling migration (Q1 2026)
**Status**: Ready for Implementation

