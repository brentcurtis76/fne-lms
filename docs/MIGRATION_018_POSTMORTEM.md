# Migration 018 Post-Mortem: Enrollment Progress Trigger Fix

**Date**: November 20, 2025
**Migration**: `018_fix_enrollment_progress_trigger.sql`
**Impact**: 618 course enrollments affected
**Data Loss**: None
**Status**: Resolved with emergency backfill

---

## Executive Summary

Migration 018, applied on October 7, 2025, successfully fixed a broken trigger but **failed to backfill historical data**, leaving 618 course enrollments with `total_lessons = 0`. This caused progress displays to show "X of 0 lessons" for affected users. The issue was discovered on November 20, 2025, during an unrelated investigation into course progression tracking for Colegio Metodista William Taylor.

---

## Timeline

| Date | Event |
|------|-------|
| **2025-10-07** | Migration 018 created and applied to production |
| **2025-10-07** | Trigger fix successful, but no backfill performed |
| **2025-10-18** | Bulk user upload creates 288 enrollments (inherits zero total_lessons) |
| **2025-11-20** | Issue discovered during William Taylor investigation |
| **2025-11-20** | Emergency backfill applied (618 enrollments fixed) |
| **2025-11-20** | Auto-fill trigger added to prevent recurrence |

---

## Root Cause Analysis

### What Went Wrong

**Primary Cause**: Migration 018 focused on fixing the trigger logic but did not include a backfill step for existing data.

**Contributing Factors**:
1. **Trigger Misconception** - Developer assumed trigger would retroactively process existing rows
2. **Incomplete Migration Pattern** - Migration only included ALTER (trigger), skipped BACKFILL step
3. **No Validation Gate** - Migration applied without pre/post row count checks
4. **Testing Gap** - No staging test with production-scale data
5. **Documentation Gap** - No migration checklist or template enforced

### The Trigger Assumption Error

```sql
-- Migration 018 created this trigger
CREATE TRIGGER trigger_update_enrollment_progress
    AFTER INSERT OR UPDATE OF completed_at
    ON lesson_progress
    FOR EACH ROW
    WHEN (NEW.completed_at IS NOT NULL)
    EXECUTE FUNCTION update_course_enrollment_progress();
```

**Developer Assumption**: This trigger would update all existing enrollments.

**Reality**: Triggers only fire on NEW database events (INSERT/UPDATE). They do **not** retroactively process existing rows.

**Impact**: 618 enrollments created before October 7, 2025, retained `total_lessons = 0`.

---

## Affected Data

### Breakdown by Phase
| Phase | Description | Count | School |
|-------|-------------|-------|--------|
| **Phase 1** | William Taylor teachers | 158 | School ID 9 |
| **Phase 2** | 7 other schools | 172 | Schools 3, 17, 25, etc. |
| **Phase 3** | Orphaned users (Oct 18) | 288 | No school assignment |
| **Total** | | **618** | System-wide |

### Data Quality Impact
- ✅ **No data loss** - All `progress_percentage` and `lessons_completed` values preserved
- ❌ **Display broken** - Progress showed "X of 0 lessons"
- ❌ **Reports affected** - Enrollments potentially filtered out of analytics
- ❌ **User confusion** - Progress bars couldn't render correctly

---

## What Should Have Happened

### Correct Migration Pattern (6 Steps)

```sql
-- STEP 1: VALIDATE CURRENT STATE
DO $$
DECLARE
    v_affected_rows INT;
BEGIN
    SELECT COUNT(*) INTO v_affected_rows
    FROM course_enrollments
    WHERE COALESCE(total_lessons, 0) = 0;

    RAISE NOTICE 'Rows to be affected: %', v_affected_rows;
END $$;

-- STEP 2: SCHEMA CHANGES
-- (Migration 018 already had this - trigger fix)

-- STEP 3: BACKFILL EXISTING DATA (MISSING!)
UPDATE course_enrollments ce
SET total_lessons = (
    SELECT COUNT(*)
    FROM lessons l
    WHERE l.course_id = ce.course_id
)
WHERE COALESCE(total_lessons, 0) = 0;

-- STEP 4: VALIDATE BACKFILL (MISSING!)
DO $$
DECLARE
    v_remaining INT;
BEGIN
    SELECT COUNT(*) INTO v_remaining
    FROM course_enrollments
    WHERE COALESCE(total_lessons, 0) = 0;

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Backfill incomplete: % rows still have zero', v_remaining;
    END IF;
END $$;

-- STEP 5: APPLY CONSTRAINTS
ALTER TABLE course_enrollments
ALTER COLUMN total_lessons SET NOT NULL;

-- STEP 6: DOCUMENT
COMMENT ON COLUMN course_enrollments.total_lessons IS
'Backfilled 2025-10-07 via Migration 018';
```

---

## Emergency Fix Applied (November 20, 2025)

### Solution Implemented

**1. Emergency Backfill (3 phases)**
```sql
-- Phase 1: William Taylor (158 rows)
UPDATE course_enrollments ce
SET total_lessons = (SELECT COUNT(*) FROM lessons WHERE course_id = ce.course_id)
WHERE user_id IN (SELECT user_id FROM user_roles WHERE school_id = 9)
  AND COALESCE(total_lessons, 0) = 0;

-- Phase 2: Other schools (172 rows)
-- ... similar backfill for 7 schools

-- Phase 3: Orphaned users (288 rows)
UPDATE course_enrollments ce
SET total_lessons = (SELECT COUNT(*) FROM lessons WHERE course_id = ce.course_id)
WHERE COALESCE(total_lessons, 0) = 0;
```

**2. Auto-Fill Trigger (Prevention)**
```sql
CREATE OR REPLACE FUNCTION set_enrollment_total_lessons()
RETURNS TRIGGER AS $$
DECLARE
    v_lesson_count INT;
BEGIN
    SELECT COUNT(*) INTO v_lesson_count
    FROM lessons
    WHERE course_id = NEW.course_id;

    IF NEW.total_lessons IS NULL OR NEW.total_lessons = 0 THEN
        NEW.total_lessons := v_lesson_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_enrollment_total_lessons
    BEFORE INSERT OR UPDATE ON course_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION set_enrollment_total_lessons();
```

**3. Constraints Applied**
- ✅ `NOT NULL` constraint on `total_lessons`
- ❌ `CHECK (total_lessons > 0)` removed (blocked legitimate use cases)

**4. Validation**
```sql
-- Confirmed zero remaining issues
SELECT COUNT(*) FROM course_enrollments WHERE COALESCE(total_lessons, 0) = 0;
-- Result: 0
```

---

## Prevention Measures Implemented

### 1. Migration Template
Created comprehensive 6-step migration template in `docs/MIGRATION_TEMPLATE.md`

### 2. Pre-Migration Checklist
- [ ] Estimated affected rows calculated
- [ ] Tested on staging
- [ ] Rollback plan documented
- [ ] Peer review completed
- [ ] Team notified

### 3. Daily Monitoring
**Cron Job**: `/api/cron/monitor-enrollments`
- Checks for zero `total_lessons` daily
- Alerts admins if count > 0
- Tracks both all-time and last-24h counts

### 4. Zero-Lesson Policy
**Policy**: ALLOW enrollments into courses with 0 lessons (with monitoring)
- See `docs/ZERO_LESSON_POLICY.md`

---

## Lessons Learned

### For Developers

1. **Triggers are not retroactive** - Always include explicit backfill UPDATE
2. **Follow the 6-step pattern** - Validate → Schema → Backfill → Validate → Constrain → Document
3. **Test on staging first** - Use production-scale data
4. **Count before and after** - Validate migration impact
5. **Document rollback plan** - Always have a revert strategy

### For Process

1. **Enforce migration template** - Make checklist mandatory
2. **Require staging tests** - Block production deploys without staging validation
3. **Add automated checks** - CI/CD validation for migration completeness
4. **Post-migration monitoring** - 24h watch period after applying migrations
5. **Document assumptions** - Explicitly state what the migration expects

### For Database Design

1. **Default values matter** - Schema had `DEFAULT 0` which masked the issue
2. **Triggers for new data** - Use triggers to auto-populate on INSERT
3. **Constraints after backfill** - Never constrain before validating data
4. **Monitor critical fields** - Daily checks for data quality regressions

---

## Cost Analysis

| Metric | Value |
|--------|-------|
| **Developer Time** | ~6 hours investigation + fix |
| **User Impact** | 618 users saw broken progress displays |
| **Duration** | 44 days (Oct 7 - Nov 20) |
| **Data Loss** | 0 (all progress preserved) |
| **Production Downtime** | 0 minutes |
| **Customer Complaints** | 1 (William Taylor school) |

---

## Related Incidents

### Git History
```bash
b5947c9 - fix: Restore migration 031 and create 032 for NOT NULL constraints
6cd0dc1 - fix: Add enrollment progress trigger fix and total_lessons tracking
cbff7cb - feat: Add unique constraint and fix upsert for lesson_progress
```

Multiple attempts to fix related issues, but backfill was consistently missed.

### Previous Investigation (October 2025)
- **Report**: `PROGRESS_TRACKING_INVESTIGATION_REPORT.md`
- **Finding**: System working correctly, but displaying all 297 users (only 25 active)
- **Fix**: Changed default sort to `activity_score`
- **Missed**: Did not detect the `total_lessons = 0` issue

---

## Recommendations

### Immediate (Completed ✅)
- ✅ Emergency backfill applied
- ✅ Auto-fill trigger created
- ✅ Daily monitoring implemented
- ✅ Migration template created

### Short-term
- [ ] Add migration checklist to PR template
- [ ] Document in team wiki
- [ ] Train team on new migration pattern
- [ ] Review other recent migrations for similar issues

### Long-term
- [ ] Automated migration validation in CI/CD
- [ ] Pre-production staging environment
- [ ] Database health dashboard
- [ ] Quarterly data quality audits

---

## Acknowledgments

**Discovered By**: Investigation into William Taylor school progress tracking
**Fixed By**: Emergency backfill + trigger (Nov 20, 2025)
**Documented By**: Claude Code + Technical Team

---

## Conclusion

Migration 018 successfully fixed the trigger logic but failed to backfill historical data due to incorrect assumptions about trigger behavior. The issue was resolved with an emergency 3-phase backfill affecting 618 enrollments, with zero data loss. Prevention measures (template, monitoring, auto-fill trigger) are now in place to prevent similar incidents.

**Key Takeaway**: Triggers only fire on NEW events. Always include explicit backfill for existing data.

---

## References

- **Migration Template**: `docs/MIGRATION_TEMPLATE.md`
- **Zero-Lesson Policy**: `docs/ZERO_LESSON_POLICY.md`
- **Monitoring Endpoint**: `pages/api/cron/monitor-enrollments.ts`
- **Original Migration**: `database/migrations/018_fix_enrollment_progress_trigger.sql`
- **Trigger Fix**: `database/migrations/020_fix_enrollment_progress_trigger.sql`

---

**Document Owner**: Technical Lead
**Last Updated**: November 20, 2025
**Status**: Resolved - Monitoring Active
