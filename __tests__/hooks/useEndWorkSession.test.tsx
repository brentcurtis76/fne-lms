// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { useEndWorkSession } from '../../hooks/useEndWorkSession';

describe('useEndWorkSession', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let sendBeaconMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    (globalThis as any).fetch = fetchMock;

    sendBeaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: sendBeaconMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires exactly one fetch POST when handleClose and unmount both close the session', () => {
    const { result, unmount } = renderHook(() => useEndWorkSession());

    // Simulate handleClose → endWorkSession
    act(() => {
      result.current.endWorkSession('meeting-1', 'session-1', false);
    });

    // Simulate unmount cleanup → endWorkSession (same sessionId)
    act(() => {
      unmount();
      result.current.endWorkSession('meeting-1', 'session-1', false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meetings/meeting-1/work-session/session-1/end',
      expect.objectContaining({ method: 'POST', keepalive: true })
    );
    expect(sendBeaconMock).not.toHaveBeenCalled();
  });

  it('fires exactly one sendBeacon on unload; subsequent fetch is suppressed', () => {
    const { result } = renderHook(() => useEndWorkSession());

    // beforeunload path
    act(() => {
      result.current.endWorkSession('meeting-1', 'session-1', true);
    });

    // Unmount cleanup path arriving after — must be deduped
    act(() => {
      result.current.endWorkSession('meeting-1', 'session-1', false);
    });

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a new session id to be ended after a previous one', () => {
    const { result } = renderHook(() => useEndWorkSession());

    act(() => {
      result.current.endWorkSession('meeting-1', 'session-1', false);
      result.current.endWorkSession('meeting-1', 'session-1', false); // dupe
      result.current.endWorkSession('meeting-1', 'session-2', false); // new id
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/session-1/end');
    expect(fetchMock.mock.calls[1][0]).toContain('/session-2/end');
  });
});
