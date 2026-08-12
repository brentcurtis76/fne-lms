// @vitest-environment node
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  identityToken,
  identityTokens,
  matchByDisplayName,
  matchParticipantIdentity,
  normalizeDisplayName,
  profileIdFromCustomerKey,
  readParticipantField,
  readParticipantIdentity,
  type AttendeeCandidate,
} from '../../../lib/zoom/attendance-identity';

/**
 * Identity matching (Z7-2 [R5]/[R6]/[R8]).
 *
 * The claim under test is not "matching works" — it is that **matching refuses to guess**.
 * A row matched to the wrong person silently asserts that someone attended a session they
 * were never in, on the surface an admin reads before deciding whether to override a
 * consultant's billable hours. An unmatched row is correct behaviour.
 *
 * Fixture values are read from the committed Z0B captures, and the guest capture is the
 * important one: FOUR of its fields are `""`.
 */

const FIXTURE_DIR = path.join(process.cwd(), '__tests__/lib/zoom/fixtures/webhooks');

interface ZoomBody {
  payload?: { object?: { participant?: Record<string, unknown> } };
}

function loadParticipant(file: string): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as {
    rawBody: string;
  };
  const body = JSON.parse(fixture.rawBody) as ZoomBody;
  return (body.payload?.object?.participant ?? {}) as Record<string, unknown>;
}

const HOST_PROFILE = '47d97a10-7c8f-4c34-8519-b4c77ed439d9';

describe('readParticipantField — Zoom says "absent" in three different ways', () => {
  it('treats empty string as absent, which is the whole point', () => {
    expect(readParticipantField('')).toBeNull();
    expect(readParticipantField('   ')).toBeNull();
    expect(readParticipantField(undefined)).toBeNull();
    expect(readParticipantField(null)).toBeNull();
    expect(readParticipantField(42)).toBeNull();
    expect(readParticipantField('  Anfitrion Spike  ')).toBe('Anfitrion Spike');
  });

  it('the committed GUEST capture has four empty-string fields, and none becomes a value', () => {
    // This is the fixture that would break a naive matcher: every one of these `""`
    // fields is a candidate key somebody could reasonably reach for.
    const guest = loadParticipant('meeting-participant_left.json');
    expect(guest.email).toBe('');
    expect(guest.participant_user_id).toBe('');
    expect(guest.id).toBe('');
    expect(guest.registrant_id).toBe('');

    for (const field of ['email', 'participant_user_id', 'id', 'registrant_id']) {
      expect(readParticipantField(guest[field])).toBeNull();
    }
  });
});

describe('readParticipantIdentity', () => {
  it('reads the host capture, and never reads participant.user_id', () => {
    const host = loadParticipant('meeting-participant_joined.json');
    expect(readParticipantIdentity(host)).toEqual({
      customerKey: '47d97a107c8f4c348519b4c77ed439d9',
      email: 'host-1213@example-synthetic.test',
      displayName: 'Anfitrion Spike',
    });
    // `user_id` is per-occurrence — Z0B's recorded trap. It exists on the fixture and is
    // deliberately absent from the identity shape.
    expect(host.user_id).toBe('62143101');
    expect(readParticipantIdentity(host)).not.toHaveProperty('userId');
  });

  it('reads the guest capture with the empty e-mail collapsed to null', () => {
    expect(readParticipantIdentity(loadParticipant('meeting-participant_left.json'))).toEqual({
      customerKey: '38a578a26df462bfe9cd1d7bbe5a0b77',
      email: null,
      displayName: 'Invitada Spike',
    });
  });
});

describe('profileIdFromCustomerKey — the inverse of toCustomerKey', () => {
  it('re-hyphenates the 32-hex key the join route mints', () => {
    // `toCustomerKey` (join.ts:250) is `userId.replace(/-/g, '')`, so the host fixture's
    // key round-trips to a well-formed uuid.
    expect(profileIdFromCustomerKey('47d97a107c8f4c348519b4c77ed439d9')).toBe(HOST_PROFILE);
  });

  it('refuses anything that cannot be one of ours', () => {
    expect(profileIdFromCustomerKey(null)).toBeNull();
    expect(profileIdFromCustomerKey('')).toBeNull();
    expect(profileIdFromCustomerKey('not-a-key')).toBeNull();
    expect(profileIdFromCustomerKey('47d97a107c8f4c348519b4c77ed439')).toBeNull(); // 30
    expect(profileIdFromCustomerKey('47d97a107c8f4c348519b4c77ed439d9ff')).toBeNull(); // 34
    expect(profileIdFromCustomerKey('47d97a10-7c8f-4c34-8519-b4c77ed439d9')).toBeNull();
    expect(profileIdFromCustomerKey('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();
  });
});

describe('normalizeDisplayName — exactly three operations, and no fourth', () => {
  it('trims, collapses internal whitespace, and case-folds', () => {
    expect(normalizeDisplayName('  Ana   María  Pérez ')).toBe('ana maría pérez');
    expect(normalizeDisplayName('ANA PÉREZ')).toBe('ana pérez');
    expect(normalizeDisplayName('')).toBeNull();
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
  });

  it('does NOT fold accents — "Martin" and "Martín" stay different people', () => {
    // Deliberate strictness. The cost is an unmatched row a facilitator confirms; the
    // alternative cost is marking the wrong person present.
    expect(normalizeDisplayName('Martin')).not.toBe(normalizeDisplayName('Martín'));
  });
});

describe('matchByDisplayName — conservative or nothing ([R6])', () => {
  const candidates: AttendeeCandidate[] = [
    { userId: 'user-ana', name: 'Ana Pérez' },
    { userId: 'user-luis', name: 'Luis Soto' },
    { userId: 'user-noname', name: null },
  ];

  it('matches exactly, after normalisation', () => {
    expect(matchByDisplayName('  ana   pérez ', candidates)).toBe('user-ana');
    expect(matchByDisplayName('LUIS SOTO', candidates)).toBe('user-luis');
  });

  it('TWO candidates for one name is unmatched, not a coin flip', () => {
    const ambiguous: AttendeeCandidate[] = [
      { userId: 'user-ana-1', name: 'Ana Pérez' },
      { userId: 'user-ana-2', name: 'ana pérez' },
    ];
    expect(matchByDisplayName('Ana Pérez', ambiguous)).toBeNull();
  });

  it('the SAME attendee listed twice is still one candidate', () => {
    const duplicated: AttendeeCandidate[] = [
      { userId: 'user-ana', name: 'Ana Pérez' },
      { userId: 'user-ana', name: 'Ana  Pérez' },
    ];
    expect(matchByDisplayName('Ana Pérez', duplicated)).toBe('user-ana');
  });

  it('refuses fuzzy, partial and first-name matching', () => {
    expect(matchByDisplayName('Ana', candidates)).toBeNull();
    expect(matchByDisplayName('Ana P', candidates)).toBeNull();
    expect(matchByDisplayName('Ana Pérez Soto', candidates)).toBeNull();
    expect(matchByDisplayName('Anna Pérez', candidates)).toBeNull();
  });

  it('never matches an absent name against an attendee with an absent name', () => {
    expect(matchByDisplayName(null, candidates)).toBeNull();
    expect(matchByDisplayName('', candidates)).toBeNull();
    expect(matchByDisplayName('   ', candidates)).toBeNull();
  });

  it('matches nothing when the surface has no expected attendees', () => {
    expect(matchByDisplayName('Ana Pérez', [])).toBeNull();
  });
});

describe('matchParticipantIdentity — the hierarchy, in order and no other ([R5])', () => {
  const identity = {
    customerKey: '47d97a107c8f4c348519b4c77ed439d9',
    email: 'host-1213@example-synthetic.test',
    displayName: 'Ana Pérez',
  };
  const attendees: AttendeeCandidate[] = [{ userId: 'user-by-name', name: 'Ana Pérez' }];

  it('customer_key wins over e-mail and name', () => {
    expect(
      matchParticipantIdentity(identity, {
        customerKeyProfileId: 'user-by-key',
        emailProfileId: 'user-by-email',
        expectedAttendees: attendees,
      })
    ).toEqual({ userId: 'user-by-key', matchedBy: 'customer_key' });
  });

  it('e-mail wins over name when the key resolved to nobody', () => {
    expect(
      matchParticipantIdentity(identity, {
        customerKeyProfileId: null,
        emailProfileId: 'user-by-email',
        expectedAttendees: attendees,
      })
    ).toEqual({ userId: 'user-by-email', matchedBy: 'email' });
  });

  it('name is the last resort', () => {
    expect(
      matchParticipantIdentity(identity, {
        customerKeyProfileId: null,
        emailProfileId: null,
        expectedAttendees: attendees,
      })
    ).toEqual({ userId: 'user-by-name', matchedBy: 'name' });
  });

  it('a decoded key that names NOBODY is not a match — user_id stays NULL', () => {
    // The lookup returning null is the store saying "no profiles row". Reshaping a key
    // into a uuid is not evidence that the uuid belongs to anyone.
    expect(
      matchParticipantIdentity(
        { customerKey: 'ffffffffffffffffffffffffffffffff', email: null, displayName: null },
        { customerKeyProfileId: null, emailProfileId: null, expectedAttendees: [] }
      )
    ).toEqual({ userId: null, matchedBy: 'unmatched' });
  });

  it('the production-shaped case: a link-join guest falls to unmatched', () => {
    // FEATURE_ZOOM_EMBED is default-OFF, so real traffic carries no customer_key. This is
    // the REQUIRED direction of failure (§15.3.5 blind spot 1), not a shortcoming.
    expect(
      matchParticipantIdentity(
        { customerKey: null, email: null, displayName: 'Alguien Sin Registro' },
        { customerKeyProfileId: null, emailProfileId: null, expectedAttendees: attendees }
      )
    ).toEqual({ userId: null, matchedBy: 'unmatched' });
  });

  it('an empty-string identity throughout is unmatched, never a phantom person', () => {
    const empty = readParticipantIdentity({ customer_key: '', email: '', user_name: '' });
    expect(
      matchParticipantIdentity(empty, {
        customerKeyProfileId: 'must-not-be-used',
        emailProfileId: 'must-not-be-used',
        expectedAttendees: attendees,
      })
    ).toEqual({ userId: null, matchedBy: 'unmatched' });
  });
});

describe('e-mail ambiguity — profiles.email is NOT database-unique (Codex ruling)', () => {
  it('two profiles holding one e-mail is UNMATCHED, the same rule the name branch applies', () => {
    // The store resolves this by taking two rows and returning null on two, rather than
    // `.maybeSingle()` — which THROWS on the duplicate, and from inside the webhook route
    // a throw is a 500 and a Zoom retry loop against a body that can never succeed.
    // Here the pure matcher's contract is pinned: a null lookup means no match, and the
    // hierarchy falls through to the name branch exactly as if the e-mail were absent.
    expect(
      matchParticipantIdentity(
        { customerKey: null, email: 'shared@test.local', displayName: 'Ana Pérez' },
        {
          customerKeyProfileId: null,
          emailProfileId: null,
          expectedAttendees: [{ userId: 'user-ana', name: 'Ana Pérez' }],
        }
      )
    ).toEqual({ userId: 'user-ana', matchedBy: 'name' });
  });
});

describe('identityTokens — every presented rank (re-review BLOCKER)', () => {
  it('lists all presented ranks, strongest first', () => {
    expect(
      identityTokens({ customerKey: 'ABCD', email: 'A@Test.Local', displayName: '  Ana  Pérez ' })
    ).toEqual(['ck:abcd', 'em:a@test.local', 'nm:ana pérez']);
  });

  it('omits the ranks the participant did not present', () => {
    expect(identityTokens({ customerKey: null, email: null, displayName: 'Ana' })).toEqual([
      'nm:ana',
    ]);
    expect(identityTokens({ customerKey: null, email: null, displayName: null })).toEqual([]);
  });

  it('THE COUNTEREXAMPLE: a downgraded leave still shares a token with its own join', () => {
    // A joins with a key and a name; a leave that omits the key searches with `nm:ana`.
    // The join's token LIST contains `nm:ana`, so the leave finds its own row — which the
    // single-primary-token design could not do, and which is why it closed a namesake.
    const join = identityTokens({ customerKey: 'A', email: null, displayName: 'Ana' });
    const downgradedLeave = identityToken({ customerKey: null, email: null, displayName: 'Ana' });
    expect(join).toEqual(['ck:a', 'nm:ana']);
    expect(downgradedLeave).toBe('nm:ana');
    expect(join).toContain(downgradedLeave);

    // ...and a namesake who presented ONLY the name shares that same weak token, which is
    // precisely why the applier refuses to close when both match.
    expect(identityTokens({ customerKey: null, email: null, displayName: 'Ana' })).toContain(
      downgradedLeave
    );
  });

  it('identityToken is exactly the first element of identityTokens', () => {
    const identity = { customerKey: 'ABCD', email: 'a@test.local', displayName: 'Ana' };
    expect(identityToken(identity)).toBe(identityTokens(identity)[0]);
  });
});

describe('identityToken — the leave\'s search key ([R3])', () => {
  it('follows the same descending confidence as the match hierarchy', () => {
    expect(
      identityToken({ customerKey: 'ABCD', email: 'a@test.local', displayName: 'Ana' })
    ).toBe('ck:abcd');
    expect(identityToken({ customerKey: null, email: 'A@Test.Local', displayName: 'Ana' })).toBe(
      'em:a@test.local'
    );
    expect(identityToken({ customerKey: null, email: null, displayName: '  Ana  Pérez ' })).toBe(
      'nm:ana pérez'
    );
  });

  it('is null when the participant presented nothing pairable at all', () => {
    expect(identityToken({ customerKey: null, email: null, displayName: null })).toBeNull();
  });

  it('is prefixed per branch, so a name can never collide with a key', () => {
    expect(identityToken({ customerKey: 'ana', email: null, displayName: null })).not.toBe(
      identityToken({ customerKey: null, email: null, displayName: 'ana' })
    );
  });
});
