# SECURITY NOTICE - IMMEDIATE ACTION REQUIRED

## ⚠️ CREDENTIAL ROTATION NEEDED

**Date:** 2025-10-29
**Severity:** CRITICAL
**Status:** Mitigated in repository, rotation required

---

## Issue

Diagnostic and testing scripts were created during debugging that contain hardcoded Supabase credentials:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (low risk - public anyway)
- `SUPABASE_SERVICE_ROLE_KEY` (HIGH RISK - grants unrestricted DB access)

These scripts were **NOT committed** to the repository but exist in the local filesystem.

---

## Immediate Actions Taken

1. ✅ Added comprehensive `.gitignore` patterns to prevent script commits:
   ```
   scripts/apply-*.js
   scripts/check-*.js
   scripts/diagnose-*.js
   scripts/test-*.js
   scripts/verify-*.js
   scripts/create-*.js
   scripts/delete-*.js
   scripts/prove-*.js
   scripts/simulate-*.js
   ```

2. ✅ Verified no scripts were committed to git history
3. ✅ All diagnostic scripts remain untracked and ignored

---

## Required Actions

### 1. Rotate Service Role Key in Supabase
1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/settings/api
2. Navigate to "Service Role" section
3. Click "Reset service_role secret"
4. Update the new key in:
   - `.env.local` (local development)
   - Vercel environment variables (production)
   - Any other deployment environments

### 2. Clean Local Scripts
Consider deleting all diagnostic scripts from local filesystem:
```bash
rm scripts/apply-*.js
rm scripts/check-*.js
rm scripts/diagnose-*.js
rm scripts/test-*.js
rm scripts/verify-*.js
rm scripts/create-*.js
rm scripts/delete-*.js
rm scripts/prove-*.js
rm scripts/simulate-*.js
```

---

## Prevention Going Forward

1. **Never hardcode credentials** - Always use environment variables:
   ```javascript
   const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
   ```

2. **Use .env files** that are in .gitignore:
   ```bash
   # .env.local
   SUPABASE_SERVICE_ROLE_KEY=your_key_here
   ```

3. **Script template** for safe database access:
   ```javascript
   require('dotenv').config({ path: '.env.local' });
   const { createClient } = require('@supabase/supabase-js');

   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
   const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

   if (!serviceRoleKey) {
     console.error('SUPABASE_SERVICE_ROLE_KEY not found in environment');
     process.exit(1);
   }

   const supabase = createClient(supabaseUrl, serviceRoleKey);
   ```

---

## Impact Assessment

- **Repository:** ✅ Clean - no credentials committed
- **Git History:** ✅ Clean - no credentials in history
- **Local Filesystem:** ⚠️ Scripts with credentials exist locally (ignored by git)
- **Production:** ⚠️ Service role key should be rotated as precaution

---

## Timeline

- **2025-10-29 22:00**: Diagnostic scripts created with hardcoded credentials
- **2025-10-29 22:55**: Migration files committed (no scripts committed)
- **2025-10-29 23:15**: Security issue identified
- **2025-10-29 23:15**: Immediate mitigation applied (.gitignore updated)
- **2025-10-29 23:15**: Security notice created

---

## Contact

If you have questions or concerns about this security notice, contact:
- **Developer:** Brent Curtis
- **Email:** bcurtis@nuevaeducacion.org
