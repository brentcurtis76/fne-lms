import { describe, it, expect } from 'vitest';
import {
  canViewParticipantEmails,
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
