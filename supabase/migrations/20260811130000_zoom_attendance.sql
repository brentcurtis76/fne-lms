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

ALTER TABLE public.zoom_attendance ENABLE ROW LEVEL SECURITY;

-- SELECT: admin — all rows ----------------------------------------------------
CREATE POLICY "zoom_attendance_admin_select" ON public.zoom_attendance
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_roles.user_id = auth.uid()
       AND user_roles.role_type = 'admin'::public.user_role_type
       AND user_roles.is_active = true
  ));

-- SELECT: the facilitator of that consultor session ---------------------------
-- Follows the baseline `attendees_consultor_select` predicate exactly, and this is
-- also the whole of the consultor row in the §7 matrix: a consultor reaches these
-- rows only by being the facilitator, never by school scope. The surface_type
-- equality is load-bearing — without it a community_meeting row whose surface_id
-- collided with a consultor_session id would be readable by that session's
-- facilitator.
CREATE POLICY "zoom_attendance_facilitator_select" ON public.zoom_attendance
  FOR SELECT USING (
    zoom_attendance.surface_type = 'consultor_session'
    AND EXISTS (
      SELECT 1 FROM public.session_facilitators sf
       WHERE sf.session_id = zoom_attendance.surface_id
         AND sf.user_id = auth.uid()
    )
  );

-- NO INSERT/UPDATE/DELETE policies for any role: writes are service-role only
-- (service_role bypasses RLS). §11 frozen decision — no webhook, reconcile job,
-- consultant action or AI process may write attendance from an authenticated
-- session. pgTAP 011 asserts the denial per persona AND asserts structurally that
-- this table carries no non-SELECT policy at all.
--
-- DELIBERATE GAP, recorded rather than papered over: community_meeting rows are
-- readable by admins only. The §7 "Fac" column applies to that surface too — via
-- community_meetings.facilitator_id, a different predicate from session_facilitators
-- — but Z7-1's scope names session_facilitators alone, and under-granting is the
-- safe direction. The policy belongs with Z7-5's facilitator panel.
