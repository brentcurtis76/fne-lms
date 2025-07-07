# FNE LMS Authentication Architecture

## Overview

This document describes the comprehensive authentication architecture implemented for the FNE LMS platform. The system has been designed to be robust, scalable, and maintainable for the long term.

## Architecture Principles

1. **No Recursive Lookups**: RLS policies never query the profiles table directly
2. **JWT-First**: Role information stored in JWT metadata for fast access
3. **Cached Roles**: Materialized view provides non-recursive role lookups
4. **Type Safety**: Full TypeScript typing for all authentication flows
5. **Comprehensive Logging**: Detailed logging without exposing sensitive data
6. **Graceful Degradation**: Multiple fallback mechanisms for role detection

## Components

### 1. Database Layer

#### Materialized View: `user_roles_cache`
```sql
CREATE MATERIALIZED VIEW user_roles_cache AS
SELECT 
    id as user_id,
    role,
    school_id,
    generation_id,
    community_id,
    is_admin,
    is_teacher
FROM profiles
WHERE approval_status = 'approved';
```

- Refreshed automatically when profiles change
- Indexed for fast lookups
- Prevents recursive RLS policy checks

#### Role Detection Functions
- `auth_is_admin()` - Check if current user is admin
- `auth_is_teacher()` - Check if current user is teacher (admin or consultor)
- `auth_get_user_role()` - Get current user's role
- `auth_has_school_access(school_id)` - Check school access
- `auth_is_course_teacher(course_id)` - Check if user teaches a course
- `auth_is_course_student(course_id)` - Check if user is enrolled

### 2. API Authentication Layer

#### Core Module: `/lib/api-auth.ts`
Provides centralized authentication for all API routes:

```typescript
// Get authenticated user
const { user, error } = await getApiUser(req, res);

// Check admin access
const { isAdmin, user, error } = await checkIsAdmin(req, res);

// Create Supabase clients
const supabase = await createApiSupabaseClient(req, res);
const adminClient = createServiceRoleClient();
```

#### Type Definitions: `/lib/types/api-auth.types.ts`
- `AuthenticatedRequest` - Extended request with auth context
- `AuthResult` - Standard authentication result
- `AdminAuthResult` - Admin check result
- `ApiError` / `ApiSuccess` - Standard response types
- `UserRole` enum - All system roles
- `HttpStatus` enum - Standard HTTP status codes

### 3. RLS Policy System

All RLS policies follow this pattern:

```sql
-- Admin access (using JWT metadata or cached role)
CREATE POLICY "table_admin_all" ON table_name
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

-- Role-based access (no recursion)
CREATE POLICY "table_teacher_manage" ON table_name
    FOR ALL TO authenticated
    USING (auth_is_course_teacher(course_id))
    WITH CHECK (auth_is_course_teacher(course_id));

-- User's own data
CREATE POLICY "table_user_own" ON table_name
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
```

### 4. Session Management

#### Auth Helpers Integration
- Uses `@supabase/auth-helpers-nextjs` for session management
- Single Supabase client instance per request
- Automatic session refresh
- Secure cookie handling

#### Metadata Sync
- User roles automatically synced to JWT metadata
- Trigger updates metadata when profile changes
- Fallback to database lookup if metadata missing

## Authentication Flow

### 1. User Login
```
User Login → Supabase Auth → Session Created → JWT with Metadata
```

### 2. API Request
```
Request → Auth Helpers → Session Validation → Role Check → Access Granted/Denied
```

### 3. Database Query
```
Query → RLS Policy → auth_is_admin() → JWT Check → Cache Check → Result
```

## Security Measures

### 1. Defense in Depth
- Multiple layers of authentication checks
- JWT validation + database verification
- Role caching to prevent timing attacks

### 2. Least Privilege
- Service role key only used when necessary
- Specific policies for each operation
- No overly permissive "allow all" policies

### 3. Audit Trail
- Comprehensive logging of auth events
- User actions tracked with timestamps
- Failed auth attempts logged

### 4. Input Validation
- UUID validation for IDs
- Email format validation
- Role enum validation
- Request body validation

## Migration Strategy

### Phase 1: Database Setup
1. Create materialized view for role caching
2. Create role detection functions
3. Update RLS policies to use new functions

### Phase 2: API Updates
1. Update all API routes to use auth helpers
2. Add proper error handling and logging
3. Implement request validation

### Phase 3: Frontend Migration
1. Migrate pages to auth-helpers hooks
2. Remove direct Supabase imports
3. Update error handling

## Monitoring and Alerts

### Key Metrics to Monitor
1. **Authentication Failures** - Track 401/403 responses
2. **RLS Policy Denials** - Monitor database query failures
3. **Session Timeouts** - Track expired sessions
4. **Role Sync Failures** - Monitor metadata sync issues

### Alert Thresholds
- \> 10 auth failures/minute from same IP
- \> 50 RLS denials/hour for any user
- \> 100 session timeouts/hour globally
- Any role sync failure

## Testing Strategy

### Unit Tests
- Role detection functions
- API authentication helpers
- Request validation

### Integration Tests
- Full authentication flow
- RLS policy enforcement
- Session management

### Performance Tests
- No recursive lookups
- Query response times
- Concurrent user load

## Troubleshooting Guide

### Common Issues

#### 1. "Infinite recursion detected in policy"
**Cause**: RLS policy checking profiles table
**Solution**: Update policy to use auth functions

#### 2. "No session found"
**Cause**: Missing or expired session
**Solution**: Check auth-helpers setup, verify cookies

#### 3. "Admin check failed but user is admin"
**Cause**: Missing role in JWT metadata
**Solution**: Run metadata sync, check triggers

#### 4. API returns 500 errors
**Cause**: Service role key missing or invalid
**Solution**: Check environment variables

## Best Practices

### For Developers

1. **Always use auth helpers** - Never create Supabase clients directly
2. **Check roles properly** - Use the provided auth functions
3. **Handle errors gracefully** - Provide meaningful error messages
4. **Log appropriately** - Log events without exposing sensitive data
5. **Validate inputs** - Use the provided validators

### For Database Admins

1. **Keep cache fresh** - Monitor materialized view refresh
2. **Audit policies regularly** - Check for overly permissive rules
3. **Monitor performance** - Watch for slow queries
4. **Backup before migrations** - Always backup before RLS changes

## Future Enhancements

1. **Real-time role updates** - Push role changes to active sessions
2. **Permission system** - Fine-grained permissions beyond roles
3. **Multi-factor authentication** - Additional security layer
4. **Session analytics** - Detailed session tracking and analysis
5. **API rate limiting** - Prevent abuse and DOS attacks

## Conclusion

This authentication architecture provides a robust, scalable foundation for the FNE LMS platform. By avoiding recursive lookups, leveraging JWT metadata, and implementing comprehensive error handling, the system can handle growth while maintaining security and performance.