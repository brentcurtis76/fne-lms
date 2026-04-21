import { useCallback, useRef } from 'react';

/**
 * Dedupes end-work-session POSTs. Returns a callback that only fires once per
 * session id — the second caller with the same sessionId is a no-op. This
 * guards against duplicate requests when both `handleClose` and the unmount
 * cleanup (or `beforeunload`) fire on modal close.
 */
export function useEndWorkSession() {
  const endedRef = useRef<string | null>(null);

  const endWorkSession = useCallback(
    (meetingId: string, sessionId: string, unloading: boolean) => {
      if (endedRef.current === sessionId) return;
      endedRef.current = sessionId;

      const url = `/api/meetings/${meetingId}/work-session/${sessionId}/end`;

      if (
        unloading &&
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function'
      ) {
        try {
          const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
          return;
        } catch {
          // fall through to fetch
        }
      }

      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch((err) => {
        console.error('Error ending work session:', err);
      });
    },
    []
  );

  return { endWorkSession };
}

export default useEndWorkSession;
