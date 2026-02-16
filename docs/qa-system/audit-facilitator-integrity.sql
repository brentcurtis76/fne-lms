/**
 * Audit Queries for Session Facilitator Integrity
 *
 * These queries identify sessions that violate facilitator integrity business rules:
 * - BR-1: Every session must have at least one facilitator
 * - BR-2: Every session must have exactly one facilitator with is_lead = true
 * - BR-3: Every facilitator must have an active consultor role
 * - BR-4: The facilitator's role must be scoped to the session's school (or globally scoped)
 *
 * Run these diagnostically to identify existing data issues.
 * Remediation must be performed manually via admin tools or direct SQL updates.
 */

-- ============================================================
-- QUERY A: Sessions with Zero Facilitators
-- ============================================================
-- Identifies all sessions (regardless of status) that have no facilitator assignments
-- These sessions violate BR-1 and cannot be approved

SELECT
  cs.id,
  cs.school_id,
  cs.title,
  cs.session_date,
  cs.status,
  cs.created_at,
  COUNT(sf.id) as facilitator_count
FROM consultor_sessions cs
LEFT JOIN session_facilitators sf ON cs.id = sf.session_id
WHERE cs.is_active = true
GROUP BY cs.id, cs.school_id, cs.title, cs.session_date, cs.status, cs.created_at
HAVING COUNT(sf.id) = 0
ORDER BY cs.session_date DESC;


-- ============================================================
-- QUERY B: Sessions with Facilitators Lacking Consultor Role
-- ============================================================
-- Identifies sessions where assigned facilitators don't have an active consultor role
-- for their session's school (violates BR-3 and BR-4)

SELECT DISTINCT
  cs.id as session_id,
  cs.school_id,
  cs.title,
  cs.session_date,
  cs.status,
  sf.user_id as problematic_facilitator_id,
  sf.is_lead,
  CASE
    WHEN ur.user_id IS NULL THEN 'No consultor role exists'
    WHEN ur.is_active = false THEN 'Consultor role is inactive'
    WHEN ur.school_id IS NOT NULL AND ur.school_id != cs.school_id THEN 'Consultor role scoped to different school'
    ELSE 'Unknown issue'
  END as issue_type
FROM consultor_sessions cs
JOIN session_facilitators sf ON cs.id = sf.session_id
LEFT JOIN user_roles ur ON sf.user_id = ur.user_id
  AND ur.role_type = 'consultor'
  AND ur.is_active = true
  AND (ur.school_id = cs.school_id OR ur.school_id IS NULL)
WHERE cs.is_active = true
  AND ur.user_id IS NULL
ORDER BY cs.session_date DESC, cs.id;


-- ============================================================
-- QUERY C: Sessions with Invalid Lead Count
-- ============================================================
-- Identifies sessions where lead facilitator count != 1 (violates BR-2)

SELECT
  cs.id,
  cs.school_id,
  cs.title,
  cs.session_date,
  cs.status,
  COUNT(CASE WHEN sf.is_lead = true THEN 1 END) as lead_count,
  COUNT(sf.id) as total_facilitators
FROM consultor_sessions cs
LEFT JOIN session_facilitators sf ON cs.id = sf.session_id
WHERE cs.is_active = true
GROUP BY cs.id, cs.school_id, cs.title, cs.session_date, cs.status
HAVING COUNT(CASE WHEN sf.is_lead = true THEN 1 END) != 1
ORDER BY cs.session_date DESC;


-- ============================================================
-- REMEDIATION STRATEGY
-- ============================================================

/*
MANUAL REMEDIATION STEPS:

1. For sessions with zero facilitators (Query A):
   - Option A: Delete the session if still in 'borrador' status (via admin tool)
   - Option B: Add facilitators via admin session detail page
   - Sessions in 'programada' or later status should be preserved; add facilitators retroactively

2. For sessions with facilitators lacking consultor role (Query B):
   - Identify the problematic facilitators and either:
     a) Add them to user_roles as active consultors for the school (if they should be consultors)
     b) Remove them from session_facilitators if they were assigned in error
   - Only after fixing can the session be approved

3. For sessions with invalid lead count (Query C):
   - If zero leads: pick one facilitator and set is_lead = true via admin tool
   - If multiple leads: uncheck all but one via admin tool

IMPORTANT NOTES:
- Do NOT use auto-remediation. These are data integrity issues that require manual review.
- After remediation, sessions become compliant with BR-1 through BR-4.
- The API validation (new in Task 5.4) will prevent future violations.
- For bulk remediation, consider using the admin session detail page UI.
*/
