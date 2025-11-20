# Database Migration Template

Use this template for all database migrations to ensure completeness and safety.

---

## Migration File Template

```sql
-- Migration: [NUMBER]_[description].sql
-- Date: YYYY-MM-DD
-- Author: [Your Name]
-- Issue: [Link to GitHub issue/ticket]
-- Estimated Rows Affected: [Number or "Unknown"]
-- Rollback Plan: [Brief description or "See rollback section"]

-- =============================================================================
-- STEP 1: VALIDATE CURRENT STATE
-- =============================================================================
-- Purpose: Document the "before" state and estimate impact
-- Action: Count rows that will be affected by this migration

DO $$
DECLARE
    v_affected_rows INT;
BEGIN
    -- Example: Count rows with the issue we're fixing
    SELECT COUNT(*) INTO v_affected_rows
    FROM table_name
    WHERE condition_to_fix;

    RAISE NOTICE '=== MIGRATION PRE-CHECK ===';
    RAISE NOTICE 'Rows to be affected: %', v_affected_rows;

    IF v_affected_rows = 0 THEN
        RAISE WARNING 'No rows need fixing - migration may be redundant';
    ELSE
        RAISE NOTICE 'Proceeding with migration affecting % rows', v_affected_rows;
    END IF;
END $$;

-- =============================================================================
-- STEP 2: SCHEMA CHANGES (if any)
-- =============================================================================
-- Purpose: Alter table structure, add columns, create indexes
-- Action: DDL statements

-- Example: Add new column
ALTER TABLE table_name
ADD COLUMN IF NOT EXISTS new_column_name INTEGER DEFAULT 0;

-- Example: Create index
CREATE INDEX IF NOT EXISTS idx_table_column
ON table_name(column_name);

-- =============================================================================
-- STEP 3: BACKFILL EXISTING DATA
-- =============================================================================
-- Purpose: Populate new/modified columns for existing rows
-- Action: UPDATE statements to fix historical data

-- Example: Backfill new column
UPDATE table_name t
SET new_column_name = (
    SELECT COUNT(*)
    FROM related_table r
    WHERE r.foreign_key = t.id
)
WHERE t.new_column_name IS NULL OR t.new_column_name = 0;

-- Log backfill result
DO $$
DECLARE
    v_updated_rows INT;
BEGIN
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    RAISE NOTICE 'Backfill complete: % rows updated', v_updated_rows;
END $$;

-- =============================================================================
-- STEP 4: VALIDATE BACKFILL
-- =============================================================================
-- Purpose: Ensure backfill was successful before applying constraints
-- Action: Count remaining invalid rows

DO $$
DECLARE
    v_remaining INT;
    v_sample_ids TEXT;
BEGIN
    -- Count rows still needing fixes
    SELECT COUNT(*) INTO v_remaining
    FROM table_name
    WHERE condition_still_broken;

    IF v_remaining > 0 THEN
        -- Get sample IDs for debugging
        SELECT STRING_AGG(id::TEXT, ', ') INTO v_sample_ids
        FROM (
            SELECT id
            FROM table_name
            WHERE condition_still_broken
            LIMIT 5
        ) sample;

        RAISE EXCEPTION 'Backfill incomplete: % rows still have invalid data. Sample IDs: %',
            v_remaining, v_sample_ids;
    END IF;

    RAISE NOTICE '=== VALIDATION SUCCESS ===';
    RAISE NOTICE 'All rows validated - 0 remaining issues';
END $$;

-- =============================================================================
-- STEP 5: APPLY CONSTRAINTS (only after validation passes)
-- =============================================================================
-- Purpose: Enforce data quality rules to prevent future issues
-- Action: Add NOT NULL, CHECK, UNIQUE constraints

-- Example: Add NOT NULL constraint
ALTER TABLE table_name
ALTER COLUMN new_column_name SET NOT NULL;

-- Example: Add CHECK constraint
ALTER TABLE table_name
ADD CONSTRAINT check_positive_value
CHECK (new_column_name >= 0);

-- =============================================================================
-- STEP 6: CREATE TRIGGERS (if needed)
-- =============================================================================
-- Purpose: Automate data population for future inserts
-- Action: Create trigger functions and triggers

CREATE OR REPLACE FUNCTION auto_populate_column()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.column_name IS NULL THEN
        NEW.column_name := (SELECT default_value FROM config);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_populate ON table_name;

CREATE TRIGGER trigger_auto_populate
    BEFORE INSERT OR UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION auto_populate_column();

GRANT EXECUTE ON FUNCTION auto_populate_column() TO authenticated;

-- =============================================================================
-- STEP 7: DOCUMENT & COMMENT
-- =============================================================================
-- Purpose: Add metadata for future developers
-- Action: Add comments to schema objects

COMMENT ON COLUMN table_name.new_column_name IS
'Description of column purpose. Auto-populated by trigger. Backfilled YYYY-MM-DD.';

COMMENT ON FUNCTION auto_populate_column IS
'Auto-populates new_column_name on insert/update. Created YYYY-MM-DD.';

-- =============================================================================
-- ROLLBACK INSTRUCTIONS
-- =============================================================================
-- If this migration fails or needs to be reverted:
/*
-- 1. Drop constraints
ALTER TABLE table_name DROP CONSTRAINT IF EXISTS check_positive_value;
ALTER TABLE table_name ALTER COLUMN new_column_name DROP NOT NULL;

-- 2. Drop trigger
DROP TRIGGER IF EXISTS trigger_auto_populate ON table_name;
DROP FUNCTION IF EXISTS auto_populate_column();

-- 3. Revert data (if applicable)
UPDATE table_name SET new_column_name = NULL WHERE condition;

-- 4. Drop column (if needed)
ALTER TABLE table_name DROP COLUMN IF EXISTS new_column_name;
*/
```

---

## Pre-Migration Checklist

Before applying any migration, complete this checklist:

- [ ] **Estimated Affected Rows**: Calculated via pre-check query
- [ ] **Tested on Staging**: Run migration on staging environment with production-like data
- [ ] **Rollback Plan Documented**: Clear steps to revert the migration
- [ ] **Downtime Required**: YES / NO (and duration estimate)
- [ ] **Backward Compatible**: YES / NO (will old code work after migration?)
- [ ] **Peer Review Completed**: At least one other developer reviewed the SQL
- [ ] **Team Notified**: Announced migration in team chat/email
- [ ] **Backup Verified**: Recent database backup exists and is restorable
- [ ] **Monitoring Ready**: Alerts configured for post-migration validation
- [ ] **Documentation Updated**: README/Wiki updated with schema changes

---

## Post-Migration Validation Checklist

After applying migration, verify:

- [ ] **Pre-check count matches updated rows**: Actual vs. estimated
- [ ] **Zero validation errors**: Validation queries return 0 issues
- [ ] **Constraints applied successfully**: `\d table_name` shows new constraints
- [ ] **Triggers active**: `\df function_name` shows trigger function
- [ ] **Application still works**: Manual testing of affected features
- [ ] **Monitoring shows no errors**: Check logs for 24 hours post-migration
- [ ] **Performance acceptable**: No significant query slowdown
- [ ] **Rollback tested** (in staging): Verify rollback steps work

---

## Migration Naming Convention

Format: `NNN_description_action.sql`

Examples:
- `018_fix_enrollment_progress_trigger.sql`
- `019_backfill_total_lessons.sql`
- `020_add_user_roles_constraint.sql`

---

## Common Pitfalls to Avoid

1. **Trigger Assumption Error**
   - ❌ Assuming triggers backfill existing data
   - ✅ Triggers only affect NEW inserts/updates
   - **Fix**: Always include explicit backfill UPDATE

2. **Constraint Before Backfill**
   - ❌ Adding NOT NULL constraint before populating column
   - ✅ Backfill → Validate → Constrain (in that order)
   - **Fix**: Follow 6-step template strictly

3. **No Validation Step**
   - ❌ Skipping post-backfill validation
   - ✅ Always verify before adding constraints
   - **Fix**: Use validation DO block

4. **Missing Rollback Plan**
   - ❌ No documented way to revert
   - ✅ Rollback SQL in migration comments
   - **Fix**: Test rollback in staging

5. **Production Untested**
   - ❌ Applying migration directly to production
   - ✅ Test on staging with production-scale data
   - **Fix**: Always test on staging first

---

## Example Migration (Reference)

See: `database/migrations/018_fix_enrollment_progress_trigger.sql` for a complete example following this template.

**Post-Mortem**: For lessons learned from Migration 018, see `docs/MIGRATION_018_POSTMORTEM.md`

---

## Questions?

Contact: Technical Lead (bcurtis@nuevaeducacion.org)

**Last Updated**: November 20, 2025
