-- =============================================================================
-- zoom_zak_issuances — the §9 `zak_issued` audit event (Z3-2, additive only)
--
-- §9 ends its issuance rule with "Every issuance writes a `zak_issued` audit
-- event", and none of the seven Z1b tables is an issuance log. This adds the
-- eighth, under exactly the posture of its neighbours: service-role only, RLS
-- enabled with ZERO policies as belt-and-braces, and the blanket REVOKE/GRANT
-- re-run at the end so the deny-state never depends on default-privilege
-- inheritance (§6 — anon and authenticated hold no USAGE on this schema and
-- cannot reach the table at all).
--
-- ## The ZAK value itself is NEVER stored
--
-- §5: "ZAK (host credential, 2h) — fetched at start-click, **never persisted**".
-- There is no column for it here and there must never be one. This table records
-- THAT an issuance happened — who received host credentials, for which meeting,
-- on whose identity, under which clause of §9, and when — which is what an audit
-- of the rule needs; the credential is what an audit must not become a copy of.
-- =============================================================================

CREATE TABLE zoom_internal.zoom_zak_issuances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The event vocabulary is a single value today. The column + CHECK exist so a
    -- later credential event (start_url, a re-issue) is an added value rather than
    -- a second table nobody joins with this one.
    event_type text NOT NULL DEFAULT 'zak_issued'
      CHECK (event_type IN ('zak_issued')),
    profile_id uuid NOT NULL,
    meeting_id uuid NOT NULL REFERENCES zoom_internal.zoom_meetings(id),
    zoom_user_id text NOT NULL REFERENCES zoom_internal.zoom_hosts(zoom_user_id),
    -- Which clause of §9 authorized it. CHECKed rather than free text: the three
    -- branches ARE the rule, and a fourth value appearing here without a migration
    -- would mean the code grew a path the rule does not describe.
    persona text NOT NULL
      CHECK (persona IN ('facilitator_own_host', 'admin_pool_host', 'admin_org_owned_host')),
    issued_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX zoom_zak_issuances_profile_idx
  ON zoom_internal.zoom_zak_issuances (profile_id);
CREATE INDEX zoom_zak_issuances_meeting_idx
  ON zoom_internal.zoom_zak_issuances (meeting_id);
CREATE INDEX zoom_zak_issuances_issued_at_idx
  ON zoom_internal.zoom_zak_issuances (issued_at);

COMMENT ON TABLE zoom_internal.zoom_zak_issuances IS
  '§9 `zak_issued` audit log: who received host credentials, for which meeting, on whose Zoom identity, under which clause of §9, and when. The ZAK VALUE IS NEVER STORED (§5: never persisted) — this records that an issuance happened, not the credential. A refused issuance writes nothing.';

-- No FK to public.profiles, deliberately, and it is the one place this table
-- departs from its neighbours: `zoom_hosts.profile_id` uses ON DELETE SET NULL so
-- a deleted profile leaves an unmapped identity behind, but doing that here would
-- erase the subject of the audit record, and ON DELETE RESTRICT would make an old
-- issuance block a deletion the platform is entitled to perform. An audit row must
-- outlive the row it names.
COMMENT ON COLUMN zoom_internal.zoom_zak_issuances.profile_id IS
  'Who received the credential. Intentionally not a foreign key — an audit row must survive the deletion of the profile it names.';

COMMENT ON COLUMN zoom_internal.zoom_zak_issuances.zoom_user_id IS
  'The host identity the ZAK was issued FOR — `zoom_hosts.zoom_user_id`, which is the meeting''s `host_zoom_user_id`. Answering "on whose identity" is the point of the §9 rule.';

ALTER TABLE zoom_internal.zoom_zak_issuances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA zoom_internal TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA zoom_internal TO service_role;
