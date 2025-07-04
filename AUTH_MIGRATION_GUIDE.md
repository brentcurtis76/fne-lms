# Authentication Migration Guide

## Overview
This guide helps migrate pages from direct Supabase imports to using auth-helpers hooks for consistent session management.

## Migration Pattern

### Old Pattern (Direct Import)
```typescript
import { supabase } from '../lib/supabase';

export default function MyPage() {
  const router = useRouter();
  
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
    };
    checkAuth();
  }, [router]);
}
```

### New Pattern (Auth Helpers)
```typescript
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';

export default function MyPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const session = useSession();
  
  useEffect(() => {
    if (!session?.user) {
      router.push('/login');
      return;
    }
  }, [session, router]);
}
```

## Key Changes

1. **Import Statement**
   - Remove: `import { supabase } from '../lib/supabase';`
   - Add: `import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';`

2. **Component Setup**
   - Add hooks at component top:
     ```typescript
     const supabase = useSupabaseClient();
     const session = useSession();
     ```

3. **Session Checks**
   - Replace: `await supabase.auth.getSession()`
   - With: Direct `session` hook usage

4. **Dependencies**
   - Add `session` and `supabase` to useEffect dependencies

## Pages Migrated
- ✅ `/pages/dashboard.tsx`
- ✅ `/pages/login.tsx`
- ✅ `/pages/profile.tsx`

## Pages Remaining (38 files)
- `/pages/admin/course-builder/index.tsx`
- `/pages/admin/user-management.tsx`
- `/pages/admin/assignment-overview.tsx`
- `/pages/notifications.tsx`
- `/pages/contracts.tsx`
- `/pages/assignments.tsx`
- `/pages/community/workspace.tsx`
- `/pages/quiz-reviews.tsx`
- `/pages/admin/consultant-assignments.tsx`
- `/pages/admin/feedback.tsx`
- `/pages/detailed-reports.tsx`
- `/pages/expense-reports.tsx`
- And 26 more...

## Benefits
- Consistent session management across all pages
- No more conflicts between different Supabase clients
- Automatic session refresh handled by auth-helpers
- Better performance with hook-based session access

## Testing After Migration
1. Login functionality
2. Page refresh maintains session
3. Navigation between pages
4. Logout functionality
5. Remember Me feature

## Notes
- The immediate auth fixes (SessionManager and _app.tsx) should prevent logout issues
- Page migrations can be done gradually as maintenance tasks
- Each migrated page should be tested individually