// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { isVerifiedMeetingEditor } from '../../../../lib/api/meetings/verified-editor';

describe('isVerifiedMeetingEditor (SM-H8)', () => {
  it('asks can_edit_meeting_verified for exactly this user and meeting', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(isVerifiedMeetingEditor({ rpc } as any, 'u1', 'm1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('can_edit_meeting_verified', { check_user_id: 'u1', check_meeting_id: 'm1' });
  });

  it.each([
    ['false', { data: false, error: null }],
    ['null', { data: null, error: null }],
    ['an error', { data: true, error: { message: 'boom' } }],
  ])('fails closed on %s', async (_label, answer) => {
    const rpc = vi.fn(async () => answer);
    await expect(isVerifiedMeetingEditor({ rpc } as any, 'u1', 'm1')).resolves.toBe(false);
  });

  it('fails closed when the call throws', async () => {
    const rpc = vi.fn(async () => { throw new Error('network'); });
    await expect(isVerifiedMeetingEditor({ rpc } as any, 'u1', 'm1')).resolves.toBe(false);
  });
});
