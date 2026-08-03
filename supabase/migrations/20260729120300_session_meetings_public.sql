-- =============================================================================
-- session_meetings_public — worker-maintained projection table (plan §6/§7;
-- Z1b-1). The ONLY public Zoom table this phase (PM ruling: attendance,
-- recordings/transcripts metadata, ai_minutas, hour overrides and consents
-- land in their own phases).
--
-- ZERO secret fields by construction: no meeting number, no passcode, no
-- join_url, no tokens — only status/window metadata for UI badges. Secrets
-- stay in zoom_internal.zoom_meetings; the authorized join endpoint (later
-- phase) is the single opening.
--
-- Writes: service-role only (NO INSERT/UPDATE/DELETE policies for
-- authenticated — the absence of a policy denies the write under RLS).
-- SELECT per the §7 matrix row: admin (all) · consultor (own school) ·
-- growth-community members (own community, is_active). Predicates follow the
-- consultor_sessions policy patterns (baseline sessions_admin_all /
-- sessions_consultor_select / sessions_gc_member_select).
-- =============================================================================

CREATE TABLE public.session_meetings_public (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    surface_type text NOT NULL CHECK (surface_type IN ('consultor_session', 'community_meeting')),
    surface_id uuid NOT NULL,
    school_id integer NOT NULL REFERENCES public.schools(id),
    growth_community_id uuid REFERENCES public.growth_communities(id),
    provider text NOT NULL DEFAULT 'zoom',
    meeting_status text NOT NULL DEFAULT 'scheduled'
      CHECK (meeting_status IN ('scheduled', 'live', 'ended', 'cancelled')),
    starts_at timestamptz,
    ends_at timestamptz,
    has_recording boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT session_meetings_public_surface_unique UNIQUE (surface_type, surface_id)
);

CREATE INDEX session_meetings_public_school_idx
  ON public.session_meetings_public (school_id);
CREATE INDEX session_meetings_public_gc_idx
  ON public.session_meetings_public (growth_community_id);
CREATE INDEX session_meetings_public_status_idx
  ON public.session_meetings_public (meeting_status);

COMMENT ON TABLE public.session_meetings_public IS
  'Worker-maintained projection of zoom_internal.zoom_meetings (plan §6): status/join-window/has_recording only — zero secret fields by construction. Writes are service-role only; SELECT per the §7 RLS matrix.';

ALTER TABLE public.session_meetings_public ENABLE ROW LEVEL SECURITY;

-- SELECT: admin — all rows ----------------------------------------------------
CREATE POLICY "session_meetings_admin_select" ON public.session_meetings_public
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_roles.user_id = auth.uid()
       AND user_roles.role_type = 'admin'::public.user_role_type
       AND user_roles.is_active = true
  ));

-- SELECT: consultor — own school only -----------------------------------------
CREATE POLICY "session_meetings_consultor_select" ON public.session_meetings_public
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_roles.user_id = auth.uid()
       AND user_roles.role_type = 'consultor'::public.user_role_type
       AND user_roles.school_id = session_meetings_public.school_id
       AND user_roles.is_active = true
  ));

-- SELECT: active growth-community member — own community only -----------------
-- (growth_community_id NULL rows never match this policy.)
CREATE POLICY "session_meetings_gc_member_select" ON public.session_meetings_public
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_roles.user_id = auth.uid()
       AND user_roles.community_id = session_meetings_public.growth_community_id
       AND user_roles.is_active = true
  ));

-- NO INSERT/UPDATE/DELETE policies for authenticated: writes are service-role
-- only (service_role bypasses RLS). pgTAP 011 asserts the denial per persona.
