# Zero-Lesson Enrollment Policy

**Policy**: **ALLOW** enrollments into courses with 0 lessons
**Effective Date**: November 20, 2025
**Status**: Active with Monitoring

---

## Policy Statement

The FNE LMS permits course enrollments into courses that currently have zero lessons. This supports flexible course building workflows where instructors may assign courses to students before all content is finalized.

---

## Rationale

### Benefits
1. **Supports Course Building** - Teachers can assign courses while still adding content
2. **Flexible Workflow** - Enroll students first, add lessons later (e.g., rolling content release)
3. **Progress Tracking Works** - When lessons are added, progress automatically updates on first completion
4. **Non-Breaking** - Doesn't disrupt existing institutional workflows
5. **Pilot/Beta Testing** - Allows early access for testing groups before course completion

### Considerations
- Empty courses may confuse students if not communicated properly
- Progress displays will show "0 of 0 lessons" until content is added
- Course enrollment doesn't guarantee immediate access to content

---

## Technical Implementation

### Database Trigger
```sql
CREATE OR REPLACE FUNCTION set_enrollment_total_lessons()
RETURNS TRIGGER AS $$
DECLARE
    v_lesson_count INT;
BEGIN
    SELECT COUNT(*) INTO v_lesson_count
    FROM lessons
    WHERE course_id = NEW.course_id;

    -- Auto-fill total_lessons (allows 0)
    IF NEW.total_lessons IS NULL OR NEW.total_lessons = 0 THEN
        NEW.total_lessons := v_lesson_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Behavior
- Enrollments into courses with 0 lessons → `total_lessons = 0`
- When first lesson is added → trigger updates on next progress event
- Progress percentage remains at 0% until lessons exist and are completed

---

## Monitoring & Safeguards

### Daily Automated Monitoring
**Endpoint**: `/api/cron/monitor-enrollments`
**Schedule**: Daily at midnight UTC
**Checks**:
1. All-time count of enrollments with `total_lessons = 0`
2. Last 24h count of newly created enrollments with `total_lessons = 0`

### Alert Triggers
- **Count > 0**: Sends notification to admin users
- **Notification includes**:
  - Total affected enrollments
  - New enrollments in last 24h
  - Link to admin dashboard

### Dashboard Metrics (Future Enhancement)
Proposed UI indicators:
- Badge: "⚠️ Course has no lessons yet"
- Admin dashboard metric: "Courses with 0 lessons but active enrollments"
- Student view warning: "Content is being added to this course"

---

## Alternative Policy (Not Implemented)

### BLOCK Empty Course Enrollments
If the policy changes in the future, the trigger can be updated to:

```sql
-- Block enrollment if course has no lessons
IF v_lesson_count = 0 THEN
    RAISE EXCEPTION 'Cannot enroll in course % - course has no lessons', NEW.course_id
    USING HINT = 'Add at least one lesson before enrolling students';
END IF;
```

**Trade-offs**:
- ❌ Breaks flexible course building workflows
- ❌ Forces strict order: lessons → enrollments
- ✅ Prevents empty-course confusion
- ✅ Enforces data quality at insert time

**Decision**: Blocked approach rejected in favor of ALLOW + monitoring.

---

## Related Documentation

- **Monitoring Setup**: `docs/ENROLLMENT_MONITORING.md`
- **Migration Post-Mortem**: `docs/MIGRATION_018_POSTMORTEM.md`
- **Database Triggers**: `database/migrations/020_fix_enrollment_progress_trigger.sql`

---

## Policy Review

**Next Review Date**: March 2026 (or earlier if issues arise)
**Review Triggers**:
- 3+ incidents of empty-course confusion reported
- Monitoring alerts exceed 10 occurrences/month
- Stakeholder feedback requests policy change

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-20 | Initial policy - ALLOW with monitoring | Claude Code Investigation |
| 2025-11-20 | Added daily cron monitoring | System |

---

**Policy Owner**: Technical Lead
**Contact**: bcurtis@nuevaeducacion.org
**Last Updated**: November 20, 2025
