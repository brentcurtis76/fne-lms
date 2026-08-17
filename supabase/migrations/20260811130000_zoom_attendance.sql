-- =============================================================================
-- public.zoom_attendance — per-person attendance intervals (plan §6/§7; Z7-1).
--
-- One row per person per interval, not per person: a participant who drops and
-- rejoins produces two rows, and merging them is Z7-2's pure interval module. A
-- table that stored a single total instead would make "reconnect intervals don't
-- double-count" (§11) untestable, because the double-count would already have
-- happened before anything could observe it.
--
-- ZERO secret fields, like the projection table beside it: no meeting number, no
-- passcode, no join_url. `zoom_meeting_uuid` is the OCCURRENCE key — the uuid
-- `meeting.started` announces, not the meeting number — because the participant
-- report and every other Zoom read key on the occurrence, and Zoom mints a new one
-- per occurrence (Z0B finding, and the reason zoom_meetings captures it at
-- `started` rather than at provision).
--
-- IDENTITY IS DELIBERATELY WEAK, and `matched_by` is what records how weak.
-- `customer_key` only reaches Zoom on the SDK join path
-- (pages/api/meet/session/[id]/join.ts:439) and FEATURE_ZOOM_EMBED is default-OFF
-- in production, so real traffic today joins by link carrying no identity field at
-- all. The matching hierarchy (Z7-2) therefore falls through to e-mail and then to
-- display name, and the REQUIRED direction of failure is `matched_by = 'unmatched'`
-- with `user_id` NULL: an unmatched row is correct behaviour that a facilitator
-- confirms by hand, a row matched to the wrong person is a defect. Both halves are
-- storable here, which is the point — `user_id` is nullable and `matched_by` is not.
--
-- `source` exists because §11 makes the reconcile participant report AUTHORITATIVE
-- over webhooks rather than additive: Z7-3 has to be able to tell which rows a
-- report supersedes, and a merge that could not distinguish them would union the
-- two and double every interval.
--
-- Writes: service-role only (NO INSERT/UPDATE/DELETE policy for any role — the
-- absence of a policy denies the write under RLS). SELECT per the §7 matrix row:
-- admin (all) · facilitator of that surface · consultor ONLY where they are the
-- facilitator. No GC member, no ED/LG/SR/CM/EL, no anon — leadership sees
-- API-computed aggregates only (PROJECT_STATE macro invariant), never these rows.
--
-- Ley 21.719: these rows name real people. Fixtures are synthetic everywhere.
-- =============================================================================

CREATE TABLE public.zoom_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    surface_type text NOT NULL CHECK (surface_type IN ('consultor_session', 'community_meeting')),
    surface_id uuid NOT NULL,
    -- §6 invariant: every public row is school-scoped, no exceptions.
    school_id integer NOT NULL REFERENCES public.schools(id),
    -- The occurrence uuid, never the meeting number.
    zoom_meeting_uuid text NOT NULL,

    -- Identity, in descending confidence. All four are nullable together on an
    -- unmatched row except `matched_by`, which always says which branch answered.
    user_id uuid REFERENCES public.profiles(id),
    customer_key text,
    display_name text,
    transient_email text,
    matched_by text NOT NULL
      CHECK (matched_by IN ('customer_key', 'email', 'name', 'unmatched')),

    -- The interval. `left_at` is NULL while the person is still in the meeting, and
    -- stays NULL forever for a session Zoom never sent a `participant_left` for.
    joined_at timestamptz NOT NULL,
    left_at timestamptz,

    source text NOT NULL CHECK (source IN ('webhook', 'report')),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX zoom_attendance_surface_idx
  ON public.zoom_attendance (surface_type, surface_id);
CREATE INDEX zoom_attendance_occurrence_idx
  ON public.zoom_attendance (zoom_meeting_uuid);

COMMENT ON TABLE public.zoom_attendance IS
  'Per-person attendance intervals for a Zoom occurrence (plan §6): one row per person per interval, merged by Z7-2 rather than at write time. Writes are service-role only; SELECT is admin + the facilitator of that surface per the §7 matrix. Zoom data is comparison/audit only and never reaches contract_hours_ledger (§11).';

COMMENT ON COLUMN public.zoom_attendance.zoom_meeting_uuid IS
  'The Zoom OCCURRENCE uuid captured by meeting.started — not the meeting number. Zoom mints a new uuid per occurrence and the participant/report APIs key on it.';
COMMENT ON COLUMN public.zoom_attendance.matched_by IS
  'Which identity branch matched: customer_key | email | name | unmatched. `unmatched` (with user_id NULL) is correct behaviour for a link-join participant, not an error — a row matched to the WRONG person is the defect this column exists to make visible.';
COMMENT ON COLUMN public.zoom_attendance.source IS
  'webhook | report. §11 makes the reconcile participant report authoritative over webhooks rather than additive, so Z7-3 needs to know which rows a report supersedes.';

-- -----------------------------------------------------------------------------
-- "Is the caller the facilitator of this surface?" — the §7 `Fac` column, as one
-- least-privilege predicate covering BOTH surface types.
--
-- Why a function rather than two inline EXISTS clauses:
--
--  1. **The inline form was wrong for a real persona.** An RLS policy's subquery is
--     itself subject to the referenced table's RLS. `session_facilitators` carries
--     `facilitators_consultor_select` (school-scoped consultor) and
--     `facilitators_gc_member_select` (community member) and nothing else, so a
--     facilitator with `facilitator_role = 'equipo_interno'` and no consultor role at
--     that school could not read their OWN facilitator row — and would therefore see
--     no attendance for a session they run. SECURITY DEFINER makes the membership
--     lookup independent of that, which is the whole reason it is used here.
--  2. **`community_meetings` needs a different predicate** (`facilitator_id`), and a
--     policy that switched on `surface_type` inline would have to reach two more
--     tables under two more sets of policies.
--
-- Least privilege, and each clause earns its keep:
--  - `auth.uid()` is read INSIDE the function, so the caller cannot supply an
--    identity. SECURITY DEFINER does not change session GUCs, so this is still the
--    authenticated caller's own uid — and NULL for anon, which matches nothing.
--  - The function answers exactly one boolean question and returns no rows, so an
--    accidental EXECUTE grant leaks a membership bit, never a row of data.
--  - `STABLE`, not `VOLATILE`: it writes nothing and is re-evaluated per statement.
--  - `SET search_path = ''` — every reference is schema-qualified, so a caller cannot
--    shadow `session_facilitators` with a temp table and vote themselves in.
--  - Unknown surface types fall to `false`. A new surface type must add its branch
--    here deliberately rather than inherit somebody else's grant.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_zoom_surface_facilitator(
  p_surface_type text,
  p_surface_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_surface_type
    WHEN 'consultor_session' THEN EXISTS (
      SELECT 1 FROM public.session_facilitators sf
       WHERE sf.session_id = p_surface_id
         AND sf.user_id = auth.uid()
    )
    WHEN 'community_meeting' THEN EXISTS (
      SELECT 1 FROM public.community_meetings cm
       WHERE cm.id = p_surface_id
         AND cm.facilitator_id = auth.uid()
    )
    ELSE false
  END
$$;

COMMENT ON FUNCTION public.is_zoom_surface_facilitator(text, uuid) IS
  'The §7 `Fac` predicate for Zoom public tables: is auth.uid() the facilitator of this surface? consultor_session via session_facilitators, community_meeting via community_meetings.facilitator_id, anything else false. SECURITY DEFINER so the membership lookup does not depend on the caller being able to read those tables under their own RLS — an equipo_interno facilitator cannot read their own session_facilitators row.';

REVOKE EXECUTE ON FUNCTION public.is_zoom_surface_facilitator(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_zoom_surface_facilitator(text, uuid)
  TO authenticated;

ALTER TABLE public.zoom_attendance ENABLE ROW LEVEL SECURITY;

-- SELECT: admin — all rows ----------------------------------------------------
CREATE POLICY "zoom_attendance_admin_select" ON public.zoom_attendance
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_roles.user_id = auth.uid()
       AND user_roles.role_type = 'admin'::public.user_role_type
       AND user_roles.is_active = true
  ));

-- SELECT: the facilitator of that surface -------------------------------------
-- This is also the whole of the consultor row in the §7 matrix: a consultor reaches
-- these rows only by being the facilitator, never by school scope. `surface_type` is
-- load-bearing and stays load-bearing inside the function — a consultor_session and a
-- community_meeting may carry the SAME uuid (separate tables, separate PKs), and
-- without the switch each surface's facilitator would read the other's attendance.
-- pgTAP 011 seeds exactly that collision.
CREATE POLICY "zoom_attendance_facilitator_select" ON public.zoom_attendance
  FOR SELECT USING (
    public.is_zoom_surface_facilitator(
      zoom_attendance.surface_type,
      zoom_attendance.surface_id
    )
  );

-- NO INSERT/UPDATE/DELETE policies for any role: writes are service-role only
-- (service_role bypasses RLS). §11 frozen decision — no webhook, reconcile job,
-- consultant action or AI process may write attendance from an authenticated
-- session. pgTAP 011 asserts the denial per persona AND asserts structurally that
-- this table carries no non-SELECT policy at all.
