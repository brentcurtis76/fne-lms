import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { ExternalLink, Loader2 } from 'lucide-react';
import MeetingDialIn from './MeetingDialIn';
import type { JoinDialIn } from '../../lib/utils/meeting-dial-in';

/**
 * The join control for a platform-managed (Zoom) session on the meeting
 * interstitial.
 *
 * A managed session has no raw link to render: `consultor_sessions.meeting_link`
 * stays NULL on purpose (plan §8) and the only opening through which anything
 * Zoom-credential-shaped leaves the server is `POST /api/meet/session/[id]/join`
 * (§5). So the link is fetched per click and used immediately — it never enters
 * this page's HTML or its `getServerSideProps` props, which is the leak Z1a
 * existed to close.
 *
 * This component decides nothing about authorization. It posts, and renders what
 * comes back: the server's own es-CL message on a denial, and the §8 "Enlace en
 * preparación" wording while provisioning is still in flight. `401`/`404` are
 * the two answers the page itself already knows how to handle, so they are
 * handed back to those same destinations rather than being re-explained here.
 *
 * ## Why the dial-in block renders HERE and not in the page (Z2-4e)
 *
 * `pages/meet/session/[id].tsx` is the surface ruling 2 names, and this component is
 * how that surface reaches the join opening — the page's own `getServerSideProps`
 * deliberately never touches `zoom_internal`. The dial-in details are the same
 * credentials `join_url` is, so they arrive on the same per-click round trip and are
 * rendered from state, never from props. Putting them in the page's props instead
 * would put them in the served HTML before anyone clicked anything: exactly the leak
 * Z1a existed to close.
 *
 * The block survives a successful join on purpose. The link opens in a new tab and
 * this tab stays behind holding the number, which is the only place a participant can
 * read it back from once the meeting is running.
 */

interface JoinMeetingButtonProps {
  sessionId: string;
}

/** §8: approve enqueues provisioning; the projection row lands seconds later. */
const PENDING_MESSAGE = 'Enlace en preparación';

/** Network/parse failure — the only copy this component authors itself. */
const REQUEST_FAILED_MESSAGE = 'No pudimos preparar el acceso a la reunión. Intenta nuevamente.';

/**
 * Narrow the wire's `dial_in` before it reaches the renderer. The server already
 * whitelists it (`buildJoinDialIn`); this is the client half of the same rule, so a
 * response shape that drifts renders nothing rather than `undefined` on the screen a
 * participant is reading into a phone keypad.
 */
function readDialIn(value: unknown): JoinDialIn | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.meeting_number !== 'string' || !Array.isArray(candidate.numbers)) {
    return null;
  }

  const numbers = candidate.numbers.filter(
    (entry): entry is JoinDialIn['numbers'][number] =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).number === 'string'
  );

  if (numbers.length === 0) return null;

  return {
    numbers,
    meeting_number: candidate.meeting_number,
    ...(typeof candidate.passcode === 'string' ? { passcode: candidate.passcode } : {}),
  };
}

type JoinOutcome =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'denied'; message: string };

const JoinMeetingButton: React.FC<JoinMeetingButtonProps> = ({ sessionId }) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<JoinOutcome>({ kind: 'idle' });
  const [dialIn, setDialIn] = useState<JoinDialIn | null>(null);

  const handleJoin = async () => {
    setBusy(true);
    setOutcome({ kind: 'idle' });
    // Cleared before every attempt: a block left over from an earlier answer must
    // never outlive the decision that produced it (a meeting that has since been
    // cancelled now answers 410, and the number on screen would be stale).
    setDialIn(null);

    try {
      const response = await fetch(`/api/meet/session/${sessionId}/join`, { method: 'POST' });

      // Same destinations getServerSideProps uses for the same two answers:
      // carry the current path across the login bounce, and let a session the
      // caller may not know about stay a 404.
      if (response.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
        return;
      }

      if (response.status === 404) {
        router.replace('/404');
        return;
      }

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        // 403 (§5's two denials), 410 (meeting closed), 503 (kill switch): the
        // server's message is already es-CL and already says which one it is.
        const message =
          body && typeof body.error === 'string' ? body.error : REQUEST_FAILED_MESSAGE;
        setOutcome({ kind: 'denied', message });
        return;
      }

      const payload = body?.data;

      if (payload?.mode === 'link' && typeof payload.join_url === 'string') {
        setDialIn(readDialIn(payload.dial_in));
        window.open(payload.join_url, '_blank', 'noopener,noreferrer');
        setOutcome({ kind: 'idle' });
        return;
      }

      setOutcome({ kind: 'pending' });
    } catch {
      setOutcome({ kind: 'denied', message: REQUEST_FAILED_MESSAGE });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleJoin}
        disabled={busy}
        data-testid="meet-join-button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand_primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        )}
        Unirse a la reunión
      </button>

      {outcome.kind === 'pending' && (
        <p
          data-testid="meet-join-pending"
          role="status"
          className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
        >
          {PENDING_MESSAGE}
        </p>
      )}

      {outcome.kind === 'denied' && (
        <p
          data-testid="meet-join-error"
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {outcome.message}
        </p>
      )}

      <p className="mt-3 text-xs text-gray-500">
        La reunión se abre en un servicio externo a GENERA, en una pestaña nueva.
      </p>

      <MeetingDialIn dialIn={dialIn} />
    </div>
  );
};

export default JoinMeetingButton;
