// @vitest-environment node
// EC-R16: updateMeeting tells the person why a draft save was refused when the
// database answers with the row level security refusal of a draft they would
// not see (42501), and passes every other error on as before.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: { error: unknown; data: unknown } = { error: null, data: null };

function chain() {
  const c: any = {
    update: () => c,
    eq: () => c,
    select: () => c,
    maybeSingle: () => Promise.resolve({ data: state.data, error: state.error }),
    single: () => Promise.resolve({ data: state.data, error: state.error }),
  };
  return c;
}

vi.mock('../../lib/supabase-wrapper', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-consultor' } } }) },
    from: () => chain(),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../utils/workspaceUtils', () => ({ logWorkspaceActivity: vi.fn() }));

import { updateMeeting, DRAFT_SAVE_NOT_NAMED_MESSAGE } from '../../utils/meetingUtils';

const SENTENCE =
  'Solo las personas nombradas en la reunión (quien la creó, facilitador/a, secretario/a o coeditores) pueden guardarla como borrador.';
const rlsError = {
  code: '42501',
  message: 'new row violates row-level security policy "Drafts are seen only by the people named on them" for table "community_meetings"',
};

describe('updateMeeting — a draft save refused because the person is not named on the meeting (EC-R16)', () => {
  beforeEach(() => {
    state.error = null;
    state.data = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('the message constant is the agreed sentence', () => {
    expect(DRAFT_SAVE_NOT_NAMED_MESSAGE).toBe(SENTENCE);
  });

  it('versioned save to borrador refused with 42501 (row level security) gives the plain sentence', async () => {
    state.error = rlsError;
    const r = await updateMeeting('m1', { title: 'T', status: 'borrador' } as any, 3);
    expect(r.success).toBe(false);
    expect(r.error).toEqual({ code: '42501', message: SENTENCE, draftNotNamed: true });
  });

  it('unversioned save to borrador refused the same way gives the plain sentence', async () => {
    state.error = rlsError;
    const r = await updateMeeting('m1', { title: 'T', status: 'borrador' } as any);
    expect(r.success).toBe(false);
    expect(r.error).toEqual({ code: '42501', message: SENTENCE, draftNotNamed: true });
  });

  it('the same refusal on a save that does not ask for borrador is passed on as today', async () => {
    state.error = rlsError;
    const r = await updateMeeting('m1', { title: 'T', status: 'programada' } as any, 3);
    expect(r.error).toBe(rlsError);
  });

  it('another 42501 on a draft save (the F18 guard) is passed on as today', async () => {
    const f18 = { code: '42501', message: "F18: a finalised meeting cannot leave the state completada" };
    state.error = f18;
    const r = await updateMeeting('m1', { title: 'T', status: 'borrador' } as any, 3);
    expect(r.error).toBe(f18);
  });

  it('any other error on a draft save is passed on as today', async () => {
    const other = { code: '23514', message: 'check violation' };
    state.error = other;
    const r = await updateMeeting('m1', { title: 'T', status: 'borrador' } as any, 3);
    expect(r.error).toBe(other);
  });
});
