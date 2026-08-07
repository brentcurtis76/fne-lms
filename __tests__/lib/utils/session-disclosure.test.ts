import { describe, it, expect } from 'vitest';
import {
  applySessionMeetingDisclosure,
  buildSessionJoinPath,
  canViewMeetingTranscript,
  canViewParticipantEmails,
  canViewRawMeetingLink,
  canViewRestrictedReports,
  filterReportsByVisibility,
  redactProfileEmails,
} from '../../../lib/utils/session-disclosure';
import { buildContext, buildUserRole, SCHOOL_ID, GC_ID } from '../../helpers/session-policy-factories';

const reports = [
  { id: 'a', visibility: 'all_participants' },
  { id: 'b', visibility: 'facilitators_only' },
];

describe('canViewRestrictedReports', () => {
  it('allows admins', () => {
    expect(canViewRestrictedReports(buildContext({ highestRole: 'admin' }))).toBe(true);
  });

  it('allows the session facilitators', () => {
    expect(
      canViewRestrictedReports(buildContext({ highestRole: 'docente', isFacilitator: true }))
    ).toBe(true);
  });

  it('denies a non-facilitator consultor who can still view the session', () => {
    expect(
      canViewRestrictedReports(
        buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
        })
      )
    ).toBe(false);
  });

  it('denies a GC leader even though canEditSession would allow them', () => {
    expect(
      canViewRestrictedReports(
        buildContext({
          highestRole: 'lider_comunidad',
          userRoles: [buildUserRole({ role_type: 'lider_comunidad', community_id: GC_ID })],
        })
      )
    ).toBe(false);
  });
});

describe('filterReportsByVisibility', () => {
  it('returns every report to a facilitator', () => {
    const ctx = buildContext({ highestRole: 'consultor', isFacilitator: true });
    expect(filterReportsByVisibility(reports, ctx)).toHaveLength(2);
  });

  it('drops facilitators_only reports for everyone else', () => {
    const ctx = buildContext({
      highestRole: 'lider_comunidad',
      userRoles: [buildUserRole({ role_type: 'lider_comunidad', community_id: GC_ID })],
    });
    expect(filterReportsByVisibility(reports, ctx).map((r) => r.id)).toEqual(['a']);
  });

  it('tolerates null/undefined report arrays', () => {
    const ctx = buildContext({ highestRole: 'admin' });
    expect(filterReportsByVisibility(null, ctx)).toEqual([]);
    expect(filterReportsByVisibility(undefined, ctx)).toEqual([]);
  });
});

describe('canViewParticipantEmails', () => {
  it('allows admins', () => {
    expect(canViewParticipantEmails(buildContext({ highestRole: 'admin' }))).toBe(true);
  });

  it('allows the session facilitators regardless of role', () => {
    expect(
      canViewParticipantEmails(buildContext({ highestRole: 'docente', isFacilitator: true }))
    ).toBe(true);
  });

  it('allows a consultor scoped to the session school', () => {
    expect(
      canViewParticipantEmails(
        buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
        })
      )
    ).toBe(true);
  });

  it('allows a global consultor', () => {
    expect(
      canViewParticipantEmails(
        buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ school_id: null })],
        })
      )
    ).toBe(true);
  });

  it('denies a consultor scoped to another school', () => {
    expect(
      canViewParticipantEmails(
        buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ school_id: 999 })],
        })
      )
    ).toBe(false);
  });

  it('ignores an inactive consultor role for the session school', () => {
    expect(
      canViewParticipantEmails(
        buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ school_id: SCHOOL_ID, is_active: false })],
        })
      )
    ).toBe(false);
  });

  it('denies a GC leader of the session community', () => {
    expect(
      canViewParticipantEmails(
        buildContext({
          highestRole: 'lider_comunidad',
          userRoles: [buildUserRole({ role_type: 'lider_comunidad', community_id: GC_ID })],
        })
      )
    ).toBe(false);
  });
});

describe('canViewRawMeetingLink', () => {
  it('allows admins', () => {
    expect(canViewRawMeetingLink(buildContext({ highestRole: 'admin' }))).toBe(true);
  });

  it('allows the session facilitators regardless of role', () => {
    expect(
      canViewRawMeetingLink(buildContext({ highestRole: 'docente', isFacilitator: true }))
    ).toBe(true);
  });

  it('allows a consultor scoped to the session school', () => {
    expect(
      canViewRawMeetingLink(
        buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
        })
      )
    ).toBe(true);
  });

  it('denies a GC leader of the session community', () => {
    expect(
      canViewRawMeetingLink(
        buildContext({
          highestRole: 'lider_comunidad',
          userRoles: [buildUserRole({ role_type: 'lider_comunidad', community_id: GC_ID })],
        })
      )
    ).toBe(false);
  });

  it('denies a consultor scoped to another school', () => {
    expect(
      canViewRawMeetingLink(
        buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ school_id: 999 })],
        })
      )
    ).toBe(false);
  });
});

describe('canViewMeetingTranscript', () => {
  it('allows admins and facilitators', () => {
    expect(canViewMeetingTranscript(buildContext({ highestRole: 'admin' }))).toBe(true);
    expect(
      canViewMeetingTranscript(buildContext({ highestRole: 'docente', isFacilitator: true }))
    ).toBe(true);
  });

  it('denies a same-school consultor who is not facilitating — narrower than the link rule', () => {
    const ctx = buildContext({
      highestRole: 'consultor',
      userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
    });
    expect(canViewRawMeetingLink(ctx)).toBe(true);
    expect(canViewMeetingTranscript(ctx)).toBe(false);
  });
});

describe('buildSessionJoinPath', () => {
  it('points at the platform interstitial', () => {
    expect(buildSessionJoinPath('abc-123')).toBe('/meet/session/abc-123');
  });
});

describe('applySessionMeetingDisclosure', () => {
  const row = {
    id: 'sess-1',
    title: 'Sesión sintética',
    meeting_link: 'https://meet.example.test/abc-def',
    meeting_transcript: 'transcripción cruda',
  };

  const gcMember = buildContext({
    highestRole: 'lider_comunidad',
    userRoles: [buildUserRole({ role_type: 'lider_comunidad', community_id: GC_ID })],
  });

  it('strips both fields for a GC member and adds has_meeting/join_path', () => {
    const out = applySessionMeetingDisclosure(row, gcMember);

    expect(out).not.toHaveProperty('meeting_link');
    expect(out).not.toHaveProperty('meeting_transcript');
    expect(out.has_meeting).toBe(true);
    expect(out.join_path).toBe('/meet/session/sess-1');
    expect(out.title).toBe('Sesión sintética');
    expect(JSON.stringify(out)).not.toContain('meet.example.test');
  });

  it('keeps both fields for an admin, and still adds has_meeting/join_path', () => {
    const out = applySessionMeetingDisclosure(row, buildContext({ highestRole: 'admin' }));

    expect(out.meeting_link).toBe(row.meeting_link);
    expect(out.meeting_transcript).toBe(row.meeting_transcript);
    expect(out.has_meeting).toBe(true);
    expect(out.join_path).toBe('/meet/session/sess-1');
  });

  it('keeps the link but strips the transcript for a non-facilitating scoped consultor', () => {
    const out = applySessionMeetingDisclosure(
      row,
      buildContext({
        highestRole: 'consultor',
        userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
      })
    );

    expect(out.meeting_link).toBe(row.meeting_link);
    expect(out).not.toHaveProperty('meeting_transcript');
  });

  it('reports has_meeting=false and join_path=null when there is no link', () => {
    const out = applySessionMeetingDisclosure(
      { id: 'sess-2', meeting_link: null, meeting_transcript: null },
      buildContext({ highestRole: 'admin' })
    );

    expect(out.has_meeting).toBe(false);
    expect(out.join_path).toBeNull();
    expect(out.meeting_link).toBeNull();
  });

  it('treats a blank link as no meeting', () => {
    const out = applySessionMeetingDisclosure(
      { id: 'sess-3', meeting_link: '   ' },
      buildContext({ highestRole: 'admin' })
    );

    expect(out.has_meeting).toBe(false);
    expect(out.join_path).toBeNull();
  });

  it('does not invent fields the row never selected', () => {
    const out = applySessionMeetingDisclosure(
      { id: 'sess-4', title: 'Sin columnas de reunión' },
      buildContext({ highestRole: 'admin' })
    );

    expect(out).not.toHaveProperty('meeting_link');
    expect(out).not.toHaveProperty('meeting_transcript');
    expect(out.has_meeting).toBe(false);
  });

  it('does not mutate the input row', () => {
    const input = { ...row };
    applySessionMeetingDisclosure(input, gcMember);
    expect(input.meeting_link).toBe(row.meeting_link);
    expect(input.meeting_transcript).toBe(row.meeting_transcript);
  });

  // ------------------------------------------------------------------
  // Sol r26 item — the sixth surface (r27).
  //
  // A Zoom-managed session keeps `meeting_link` NULL BY DESIGN (plan §8), so deciding
  // from the raw link alone told every API caller `has_meeting: false, join_path: null`
  // for exactly the sessions this phase exists to serve. r26 routed five surfaces
  // through `sessionOffersPlatformJoin`; this is the sixth, with the same root cause.
  // ------------------------------------------------------------------

  describe('a managed session, whose meeting_link is NULL by design', () => {
    const managed = {
      id: 'sess-managed-1',
      title: 'Sesión gestionada por la plataforma',
      meeting_link: null,
      is_zoom_managed: true,
    };

    it('reports has_meeting=true and a join_path for a GC member', () => {
      const out = applySessionMeetingDisclosure(managed, gcMember);

      expect(out.has_meeting).toBe(true);
      expect(out.join_path).toBe('/meet/session/sess-managed-1');
      expect(out).not.toHaveProperty('meeting_link');
    });

    it('reports has_meeting=true for an admin without inventing a link to carry', () => {
      const out = applySessionMeetingDisclosure(managed, buildContext({ highestRole: 'admin' }));

      expect(out.has_meeting).toBe(true);
      expect(out.join_path).toBe('/meet/session/sess-managed-1');
      // Privileged callers keep the column, and the column is genuinely NULL.
      expect(out.meeting_link).toBeNull();
    });

    it('never lets the real Zoom URL into the payload of an unentitled caller', () => {
      // A managed session's real join URL lives in `zoom_internal` and must never reach
      // `consultor_sessions`. This asserts the invariant end to end with a distinctive
      // synthetic value: if a future change routed the raw link through the disclosure,
      // this marker would appear somewhere in the serialized payload.
      const MARKER = 'https://zoom.test/j/89999999999?pwd=SYNTHETIC-R27-MARKER';
      const out = applySessionMeetingDisclosure(
        { ...managed, meeting_link: MARKER },
        gcMember
      );

      expect(out.has_meeting).toBe(true);
      expect(out.join_path).toBe('/meet/session/sess-managed-1');
      expect(JSON.stringify(out)).not.toContain('SYNTHETIC-R27-MARKER');
      expect(JSON.stringify(out)).not.toContain('zoom.test');
    });

    it('answers exactly as before for an unmanaged session with no link', () => {
      const out = applySessionMeetingDisclosure(
        { id: 'sess-plain', meeting_link: null, is_zoom_managed: false },
        buildContext({ highestRole: 'admin' })
      );

      expect(out.has_meeting).toBe(false);
      expect(out.join_path).toBeNull();
    });

    it('ignores a has_meeting the caller put on the input row', () => {
      // `sessionOffersPlatformJoin` accepts `has_meeting` so a client-side row that has
      // already been through this helper can be re-tested. Feeding it back in HERE would
      // let a payload assert its own answer, so only the two source fields are passed.
      const out = applySessionMeetingDisclosure(
        { id: 'sess-liar', meeting_link: null, has_meeting: true } as {
          id: string;
          meeting_link: string | null;
          has_meeting: boolean;
        },
        buildContext({ highestRole: 'admin' })
      );

      expect(out.has_meeting).toBe(false);
      expect(out.join_path).toBeNull();
    });
  });
});

describe('redactProfileEmails', () => {
  it('removes email from a direct profiles embed and keeps the rest', () => {
    const row = {
      id: 'x',
      user_id: 'u1',
      profiles: { id: 'u1', first_name: 'Ana', last_name: 'Perez', email: 'ana@test.local' },
    };
    const out = redactProfileEmails(row);
    expect(out.profiles).not.toHaveProperty('email');
    expect(out.profiles.first_name).toBe('Ana');
    expect(out.id).toBe('x');
  });

  it('removes email from a nested profiles embed (list GET shape)', () => {
    const row = {
      id: 's1',
      session_facilitators: [
        { user_id: 'u1', profiles: { first_name: 'Ana', email: 'ana@test.local' } },
        { user_id: 'u2', profiles: { first_name: 'Bo', email: 'bo@test.local' } },
      ],
    };
    const out = redactProfileEmails(row);
    expect(out.session_facilitators[0].profiles).not.toHaveProperty('email');
    expect(out.session_facilitators[1].profiles).not.toHaveProperty('email');
    expect(JSON.stringify(out)).not.toContain('@test.local');
  });

  it('handles arrays, nulls and profile arrays', () => {
    expect(redactProfileEmails([{ profiles: null }, { profiles: [] }])).toEqual([
      { profiles: null },
      { profiles: [] },
    ]);
    expect(
      redactProfileEmails([{ profiles: [{ first_name: 'Ana', email: 'a@test.local' }] }])
    ).toEqual([{ profiles: [{ first_name: 'Ana' }] }]);
  });

  it('leaves a top-level email column untouched (only profiles embeds are redacted)', () => {
    const row = { id: 'x', email_sent_at: '2026-03-10', profiles: { email: 'a@test.local' } };
    const out = redactProfileEmails(row);
    expect(out.email_sent_at).toBe('2026-03-10');
    expect(out.profiles).toEqual({});
  });

  it('does not mutate the input', () => {
    const row = { profiles: { email: 'a@test.local' } };
    redactProfileEmails(row);
    expect(row.profiles.email).toBe('a@test.local');
  });
});
