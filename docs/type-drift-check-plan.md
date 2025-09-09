# Type Drift Check Plan

## Overview
Plan to catch type regressions during CI pipeline when using typed routes with `database.generated.ts`.

## Implementation Strategy

### 1. CI Workflow Integration
Add to `.github/workflows/type-drift-check.yml`:
```yaml
- name: Type Generation Check
  run: |
    npm run typegen:check
    git diff --exit-code types/database.generated.ts
```

### 2. Scripts Required
Create `scripts/typegen-check.sh`:
```bash
#!/bin/bash
# Generate fresh types from database
npx supabase gen types typescript --project-id=$SUPABASE_PROJECT_ID > types/database.generated.tmp.ts

# Compare with committed version
diff types/database.generated.ts types/database.generated.tmp.ts

if [ $? -ne 0 ]; then
  echo "⚠️ Type drift detected! Database schema differs from generated types."
  echo "Run 'npm run typegen' locally and commit the changes."
  exit 1
fi

echo "✅ Types are in sync with database"
```

### 3. NPM Scripts
Add to package.json:
```json
{
  "scripts": {
    "typegen": "npx supabase gen types typescript --project-id=$SUPABASE_PROJECT_ID > types/database.generated.ts",
    "typegen:check": "bash scripts/typegen-check.sh"
  }
}
```

### 4. Feature Flag Monitoring
Track typed routes usage:
```javascript
// utils/typedRoutesWrapper.ts additions
export function logTypedRoutesMetrics() {
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({
      event: 'typed_routes_usage',
      enabled: TYPED_ROUTES_ENABLED,
      timestamp: new Date().toISOString()
    }));
  }
}
```

## Rollback Strategy

### Quick Rollback (Immediate)
1. Set `ENABLE_TYPED_ROUTES=false` in environment
2. Restart application
3. Legacy handlers take over immediately

### Full Rollback (if needed)
1. Revert typed handler files (*-typed.ts)
2. Remove wrapper imports from route files
3. Delete `utils/typedRoutesWrapper.ts`

## Monitoring & Metrics

### Success Metrics
- Zero TypeScript errors with typed handlers
- API response times remain stable (<2s)
- No increase in 500 errors

### Monitoring Points
1. Log mode on startup
2. Track handler execution time
3. Monitor TypeScript build errors
4. Watch for runtime type mismatches

## Gradual Rollout Plan

### Phase 1: Admin Routes (Current)
- `/api/admin/networks/*` - IMPLEMENTED
- Monitor for 24 hours
- Check logs for issues

### Phase 2: Read-Only Routes
- `/api/courses/*` (GET only)
- `/api/lessons/*` (GET only)
- Lower risk, high traffic

### Phase 3: Write Routes
- `/api/courses/*` (POST/PUT/DELETE)
- `/api/assignments/*`
- Higher risk, needs careful testing

### Phase 4: Full Rollout
- All remaining routes
- Remove legacy handlers
- Make typed routes default

## Acceptance Criteria
✅ Feature flag toggles between legacy and typed handlers
✅ No breaking changes when flag is off
✅ Typed handlers use `database.generated.ts`
✅ CI catches type drift
✅ Rollback documented and tested
✅ Monitoring in place for production