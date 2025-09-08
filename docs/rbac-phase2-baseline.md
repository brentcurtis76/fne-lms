# RBAC Phase 2: Baseline Permissions

## Overview

Phase 2 introduces a database-backed baseline for role permissions, eliminating hardcoded permission matrices in the application code. This provides a single source of truth for default permissions while maintaining the test overlay system from Phase 1.

## Architecture

### Baseline Table
- **Table**: `role_permission_baseline`
- **Purpose**: Stores default permissions for each role
- **Modification**: Only through reviewed SQL migrations
- **Access**: Read-only at runtime via RLS

### Data Flow
```
1. Baseline (role_permission_baseline)
   ↓
2. Test Overlays (role_permissions where is_test=true)
   ↓
3. Effective Permissions (baseline + overlays, overlays win)
```

## Key Design Decisions

### 1. Migration-Only Updates
Baseline permissions are only modified through SQL migrations that are:
- Version controlled
- Code reviewed  
- Applied in controlled deployment windows
- Fully auditable via git history

### 2. Overlay Precedence
Test overlays always override baseline for the same permission:
- Allows safe testing without changing baseline
- 24-hour TTL ensures temporary nature
- Cleanup returns to baseline state

### 3. Source Tracking
The `get_effective_permissions` RPC returns a `source` field:
- `'baseline'` - Permission from baseline table
- `'test_overlay'` - Permission from test overlay
This enables debugging and understanding permission origins.

## How to Change Baseline Permissions

### For Existing Permissions
Create a migration like:
```sql
-- Update admin's manage_users permission
UPDATE role_permission_baseline 
SET granted = false, 
    metadata = jsonb_set(metadata, '{updated_at}', to_jsonb(now()))
WHERE role_type = 'admin' 
  AND permission_key = 'manage_users';
```

### For New Permissions
Create a migration like:
```sql
-- Add new permission for all roles
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
SELECT 
  rt.type,
  'new_permission_key',
  CASE 
    WHEN rt.type = 'admin' THEN true
    ELSE false
  END,
  '{"category": "new_category"}'::jsonb
FROM role_types rt
ON CONFLICT (role_type, permission_key) DO NOTHING;
```

### For New Roles
1. First add to role_types catalog
2. Then add baseline permissions:
```sql
INSERT INTO role_permission_baseline (role_type, permission_key, granted)
SELECT 'new_role', permission_key, false
FROM (SELECT DISTINCT permission_key FROM role_permission_baseline) p
ON CONFLICT DO NOTHING;
```

## Testing Workflow

1. **Test with Overlays**: Use the UI in test mode to experiment
2. **Validate Changes**: Confirm the permission changes work correctly
3. **Create Migration**: Write SQL to update baseline
4. **Deploy to Staging**: Apply migration and verify
5. **Production Release**: Apply in maintenance window

## Security Considerations

- Baseline table has no write policies - immune to runtime tampering
- Service role cannot modify baseline (RLS enforced)
- All changes tracked in version control
- Rollback is simple: revert migration

## Performance

- Indexed on role_type for fast lookups
- Single query combines baseline + overlays
- Caching potential at API layer (not implemented)

## Future Enhancements

- Permission groups/categories for bulk operations
- Permission inheritance between roles
- Time-based permission schedules
- Audit trail for baseline changes (beyond git)