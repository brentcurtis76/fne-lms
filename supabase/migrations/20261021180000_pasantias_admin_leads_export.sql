-- =============================================================================
-- pasantias_admin_leads_export — the admin leads CSV export from ONE snapshot.
-- PASANT-B004 C009 fix. The paged export ran one READ COMMITTED snapshot per
-- page, so a write committing mid-walk could drop a contact that matched the
-- whole time and mix pre- and post-commit rows. This function returns the
-- matching total and every matching contact, with its interests, from a single
-- SELECT inside a STABLE function, i.e. from the calling statement's snapshot.
--
-- Additive only: one new function. No table, column, index, policy, RLS,
-- default privilege or schema-wide grant changes. Rollback is FORWARD-ONLY:
-- stop the caller, then ship a follow-up migration.
--
-- CONTRACT (the caller is GET /api/admin/pasantia-leads?export=1)
--   arguments  p_status    NULL or new | contacted | converted | dismissed
--              p_search    NOT NULL; '' means no search; at most 120 characters;
--                          none of , ( ) " \ * (the route's sanitizeSearchTerm
--                          output). % and _ stay ILIKE wildcards, as in the
--                          screen's PostgREST ilike filter.
--              p_program   NULL or inspira | mirada-profunda | sin-programa
--              p_max_bytes NULL (no byte limit) or 1 .. 1 000 000 000
--              anything else -> 22023 'pasantias_admin_leads_export: invalid_argument'
--   filters    the screen's meaning exactly: status equality; search ILIKE over
--              first_name, last_name, email, institution; a program keeps
--              contacts with that interest on (lead_id, cohort) and returns ALL
--              their interests; sin-programa keeps contacts with none.
--   order      created_at DESC, id DESC
--   result     json object with exactly these keys, in this order:
--              total            integer, matching contacts
--              too_large_rows   total > 100 000 (500 x 200, the paged export's
--                               ceiling); leads is then [] and bytes null
--              too_large_bytes  p_max_bytes set and bytes > p_max_bytes; leads
--                               is then [] and bytes still reported
--              bytes            octet_length of the built leads array text, or
--                               null when too_large_rows
--              leads            array of the 23 route LEAD_COLUMNS plus
--                               program_interests: [{program,
--                               consent_accepted_at, consent_notice_version,
--                               created_at}] in program order (inspira,
--                               mirada-profunda), [] when none. No reply_* key.
--   json, not jsonb: a 100 000-contact array can pass jsonb's ~256 MB limit at
--   worst-case field sizes; json is bounded by the 1 GB value limit only.
--
-- SNAPSHOT. STABLE makes the body run under the calling statement's snapshot
-- (PL/pgSQL executes a non-volatile function read-only, without a new
-- snapshot). The SET clause and PL/pgSQL keep it from ever being inlined, so
-- its tables are locked only while it executes, after that snapshot exists.
-- Validation reads parameters only; all data comes from the one RETURN query.
--
-- ACCESS. SECURITY INVOKER with search_path = ''. EXECUTE for service_role
-- only (it holds SELECT on both tables and BYPASSRLS); PUBLIC, anon and
-- authenticated hold nothing, so an admin JWT on /rest/v1/rpc is refused.
-- =============================================================================

CREATE FUNCTION public.pasantias_admin_leads_export(
  p_status text, p_search text, p_program text, p_max_bytes integer)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  max_contacts constant integer := 100000;
BEGIN
  IF (p_status IS NOT NULL AND p_status NOT IN ('new', 'contacted', 'converted', 'dismissed'))
     OR (p_program IS NOT NULL AND p_program NOT IN ('inspira', 'mirada-profunda', 'sin-programa'))
     OR p_search IS NULL OR char_length(p_search) > 120
     OR p_search ~ '[,()"*]' OR strpos(p_search, E'\\') > 0
     OR (p_max_bytes IS NOT NULL AND p_max_bytes NOT BETWEEN 1 AND 1000000000) THEN
    RAISE EXCEPTION 'pasantias_admin_leads_export: invalid_argument' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH matching AS MATERIALIZED (
      SELECT l.id, l.cohort, l.first_name, l.last_name, l.email, l.institution, l.phone, l.role_title,
             l.num_people, l.message, l.notes, l.status, l.source_path, l.utm_source, l.utm_medium,
             l.utm_campaign, l.consent_accepted_at, l.consent_notice_version, l.marketing_opt_in,
             l.marketing_opt_in_at, l.brochure_sent_at, l.created_at, l.updated_at
        FROM public.pasantias_leads AS l
       WHERE (p_status IS NULL OR l.status = p_status)
         AND (p_search = ''
              OR l.first_name ILIKE '%' || p_search || '%'
              OR l.last_name ILIKE '%' || p_search || '%'
              OR l.email ILIKE '%' || p_search || '%'
              OR l.institution ILIKE '%' || p_search || '%')
         AND (p_program IS NULL
              OR (p_program = 'sin-programa' AND NOT EXISTS (
                    SELECT 1 FROM public.pasantias_lead_program_interests AS i
                     WHERE i.lead_id = l.id AND i.cohort = l.cohort))
              OR (p_program <> 'sin-programa' AND EXISTS (
                    SELECT 1 FROM public.pasantias_lead_program_interests AS i
                     WHERE i.lead_id = l.id AND i.cohort = l.cohort AND i.program = p_program)))
    ),
    counted AS MATERIALIZED (
      SELECT count(*)::integer AS total FROM matching
    ),
    -- The array is built only at or under the ceiling; above it the CASE never
    -- reaches the aggregate.
    built AS MATERIALIZED (
      SELECT c.total,
             CASE WHEN c.total > max_contacts THEN NULL::json ELSE (
               SELECT coalesce(json_agg(json_build_object(
                        'id', m.id, 'cohort', m.cohort, 'first_name', m.first_name, 'last_name', m.last_name,
                        'email', m.email, 'institution', m.institution, 'phone', m.phone,
                        'role_title', m.role_title, 'num_people', m.num_people, 'message', m.message,
                        'notes', m.notes, 'status', m.status, 'source_path', m.source_path,
                        'utm_source', m.utm_source, 'utm_medium', m.utm_medium, 'utm_campaign', m.utm_campaign,
                        'consent_accepted_at', m.consent_accepted_at,
                        'consent_notice_version', m.consent_notice_version,
                        'marketing_opt_in', m.marketing_opt_in, 'marketing_opt_in_at', m.marketing_opt_in_at,
                        'brochure_sent_at', m.brochure_sent_at, 'created_at', m.created_at,
                        'updated_at', m.updated_at,
                        'program_interests', (
                          SELECT coalesce(json_agg(json_build_object(
                                   'program', i.program, 'consent_accepted_at', i.consent_accepted_at,
                                   'consent_notice_version', i.consent_notice_version, 'created_at', i.created_at)
                                   ORDER BY coalesce(array_position(ARRAY['inspira', 'mirada-profunda'], i.program), 3),
                                            i.program), '[]'::json)
                            FROM public.pasantias_lead_program_interests AS i
                           WHERE i.lead_id = m.id AND i.cohort = m.cohort))
                        ORDER BY m.created_at DESC, m.id DESC), '[]'::json)
                 FROM matching AS m) END AS leads
        FROM counted AS c
    ),
    sized AS MATERIALIZED (
      SELECT b.total, b.leads, octet_length(b.leads::text) AS bytes FROM built AS b
    )
    SELECT json_build_object(
             'total', s.total,
             'too_large_rows', s.total > max_contacts,
             'too_large_bytes', coalesce(s.bytes > p_max_bytes, false),
             'bytes', s.bytes,
             'leads', CASE WHEN s.leads IS NULL OR coalesce(s.bytes > p_max_bytes, false) THEN '[]'::json
                           ELSE s.leads END)
      FROM sized AS s
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pasantias_admin_leads_export(text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_admin_leads_export(text, text, text, integer) TO service_role;

COMMENT ON FUNCTION public.pasantias_admin_leads_export(text, text, text, integer) IS
  'Admin leads CSV export (PASANT-B004 C009): total and every matching contact with its interests from one snapshot, json {total, too_large_rows, too_large_bytes, bytes, leads}; ceiling 100000 contacts. Service-role only.';
