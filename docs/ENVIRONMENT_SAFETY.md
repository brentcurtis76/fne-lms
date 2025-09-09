# Environment Configuration Safety Guide

## 🚨 Critical: Production Outage Prevention

This guide prevents critical environment misconfigurations that can cause production data to be inaccessible.

## Root Cause of Previous Outage

**Issue**: `.env.local` was a symbolic link pointing to `.env.test.local` instead of containing production configuration.
**Result**: Application connected to local test database instead of production Supabase cloud database.
**Impact**: All user data, profiles, courses, and notifications appeared missing.

## Prevention Measures Implemented

### 1. Automatic Environment Validation

**Pre-Development Check**: `npm run dev` now automatically validates environment before starting.

```bash
# Safe development start (recommended)
npm run dev

# Bypass validation (use only if needed)
npm run dev:unsafe
```

**Manual Validation**:
```bash
node scripts/validate-environment.js
```

### 2. Runtime Environment Monitoring

The application now automatically detects environment issues:
- Logs environment status on server startup
- Warns in browser console if test database detected
- Provides clear error messages for misconfiguration

### 3. File System Safety Checks

**Symbolic Link Detection**: Prevents `.env.local` from being a symbolic link
**Backup System**: Automatically creates/maintains `.env.local.backup`
**URL Validation**: Ensures production URL matches expected value

## Expected Configuration

### Production Environment (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://sxlogxqzmarhqsblxmtj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Test Environment (.env.test.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Quick Recovery Steps

If you encounter environment issues:

1. **Check Current Configuration**:
   ```bash
   node scripts/validate-environment.js
   ```

2. **Remove Symbolic Link** (if detected):
   ```bash
   rm .env.local
   ```

3. **Restore Production Configuration**:
   ```bash
   cp .env.local.backup .env.local
   ```

4. **Restart Development Server**:
   ```bash
   # Kill existing server (Ctrl+C or find process)
   npm run dev
   ```

## Warning Signs

Watch for these indicators of environment issues:

### Browser Console
- "Application is using TEST database - data may not load correctly"
- "Environment Issue Detected"

### Server Logs
- "Environment: TEST" (should be "PRODUCTION")
- "Environment warnings" or "Environment errors"

### Application Behavior
- No user profiles loading
- Empty dashboard
- No courses or schools visible
- No notifications

## Best Practices

1. **Always use `npm run dev`** (not `npm run dev:unsafe`)
2. **Never create symbolic links** for `.env.local`
3. **Keep `.env.local.backup`** updated
4. **Check console logs** on application startup
5. **Validate environment** before important development sessions

## Files Created/Modified

- `scripts/validate-environment.js` - Environment validation script
- `scripts/pre-dev-check.sh` - Pre-development safety check
- `lib/utils/environmentMonitor.ts` - Runtime environment monitoring
- `package.json` - Updated dev script with validation
- `pages/_app.tsx` - Integrated runtime validation

## Recovery Contact

If environment issues persist:
- **Technical Support**: Brent Curtis
- **Phone**: +56941623577
- **Email**: bcurtis@nuevaeducacion.org