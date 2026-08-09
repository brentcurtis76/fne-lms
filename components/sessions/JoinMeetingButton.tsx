import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ExternalLink, Loader2 } from 'lucide-react';
import MeetingDialIn from './MeetingDialIn';
import PreJoinCheck from './PreJoinCheck';
import type { JoinDialIn } from '../../lib/utils/meeting-dial-in';
import { supportsComponentView } from '../../lib/meet/embed-capabilities';
import {
  loadMeetingSdk,
  SDK_LANGUAGE,
  type ZoomEmbeddedClient,
} from '../../lib/meet/zoom-sdk-loader';

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
 *
 * ## The embedded meeting (Z3-3)
 *
 * The same per-click response now has a second success shape: `mode: 'sdk'`, which
 * carries the credentials for joining Zoom INSIDE this page instead of a link out of
 * it. Three rules govern how this component treats it.
 *
 * **`mode` is the only signal.** This component never reads `FEATURE_ZOOM_EMBED` — not
 * even the `NEXT_PUBLIC_` half. One flag needs two env vars (server + browser), and a
 * client that branched on its own copy would split-brain on a deployment that set one
 * and not the other: a route minting SDK payloads for a UI that will not render them,
 * or a UI reaching for an embed the route will not serve. The server already says which
 * mode it is in, so there is nothing to ask twice.
 *
 * **The fallback is a second request, never a smuggled URL.** §5 forbids `join_url` in
 * an SDK payload, so there is nothing pre-loaded to fall back TO. When the embed fails
 * — CDN unreachable, the global absent, `init` or `join` rejecting, a device that
 * cannot run Component View — this posts the SAME endpoint again with an explicit
 * `{ fallback: 'link' }` intent and the server skips the SDK branch and nothing else.
 * It cannot escalate: link mode is what this same persona already received before Z3
 * existed, so the request is to be given LESS. It happens at most once per attempt.
 *
 * **The credentials live for exactly one call.** `signature`, `passcode` and `zak` go
 * into a ref, not into state, and the ref is emptied the moment the join is attempted.
 * Nothing renders them, nothing logs them, and a later click fetches fresh ones rather
 * than reusing what is gone (§5: "fetched at start-click, never persisted").
 *
 * Component View is desktop-only (plan §2, verified in Z0B); mobile takes the link
 * until the Client View route lands (chunk Z3-4).
 */

interface JoinMeetingButtonProps {
  sessionId: string;
}

/** §8: approve enqueues provisioning; the projection row lands seconds later. */
const PENDING_MESSAGE = 'Enlace en preparación';

/** Network/parse failure — the only copy this component authors itself. */
const REQUEST_FAILED_MESSAGE = 'No pudimos preparar el acceso a la reunión. Intenta nuevamente.';

/**
 * The fallback path's popup is further from the click than the primary one — a failed
 * embed spends seconds on the CDN first — so a browser is likelier to refuse it. Only
 * that path checks, and it says what to press rather than exposing the URL.
 */
const POPUP_BLOCKED_MESSAGE =
  'Tu navegador bloqueó la ventana nueva. Presiona «Unirse a la reunión» otra vez para abrirla.';

/** Shown while the SDK downloads and connects. */
const EMBED_CONNECTING_MESSAGE = 'Conectando a la reunión…';

/** Ruling ②: the one value the server recognises on the wire. */
const LINK_FALLBACK_INTENT = 'link';

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

/**
 * The SDK half of an `mode: 'sdk'` response, narrowed before it reaches the SDK — the
 * same client-side half of the server's own rule that `readDialIn` is. Every field is
 * required and non-empty; a payload missing one is not repaired here, it takes the
 * fallback, because a join attempted with a blank signature or passcode fails at Zoom
 * with an opaque error where link mode would simply have worked.
 *
 * `zak` is the exception: absent for every participant, and absent for a host §9
 * refused. Absent is a legitimate shape, not a malformed one.
 */
interface EmbedCredentials {
  signature: string;
  sdkKey: string;
  meetingNumber: string;
  passcode: string;
  userName: string;
  customerKey: string;
  zak?: string;
}

function readSdkCredentials(value: unknown): EmbedCredentials | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Record<string, unknown>;
  const text = (key: string): string | null => {
    const field = candidate[key];
    return typeof field === 'string' && field !== '' ? field : null;
  };

  const signature = text('signature');
  const sdkKey = text('sdk_key');
  const meetingNumber = text('meeting_number');
  const passcode = text('passcode');
  const userName = text('user_name');
  const customerKey = text('customer_key');

  if (!signature || !sdkKey || !meetingNumber || !passcode || !userName || !customerKey) {
    return null;
  }

  const zak = text('zak');

  return {
    signature,
    sdkKey,
    meetingNumber,
    passcode,
    userName,
    customerKey,
    ...(zak ? { zak } : {}),
  };
}

type JoinOutcome =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'denied'; message: string }
  /** Credentials in hand, preflight on screen, nothing mounted yet. */
  | { kind: 'preflight' }
  | { kind: 'joining' }
  | { kind: 'joined' };

/** The three states in which the SDK owns a mounted root element in this tree. */
const EMBED_OUTCOMES = ['preflight', 'joining', 'joined'];

const JoinMeetingButton: React.FC<JoinMeetingButtonProps> = ({ sessionId }) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<JoinOutcome>({ kind: 'idle' });
  const [dialIn, setDialIn] = useState<JoinDialIn | null>(null);
  /**
   * NOT state, and emptied by the join attempt that consumes it. A `useState` here
   * would keep a signature, a passcode and possibly a ZAK alive across every later
   * render of this tree, which is the thing §5 is about.
   */
  const credentialsRef = useRef<EmbedCredentials | null>(null);
  const sdkRootRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<ZoomEmbeddedClient | null>(null);

  /**
   * Turns one join response into what the user sees.
   *
   * `allowEmbed` is false for the fallback request and is what makes the fallback
   * terminal: a second `mode: 'sdk'` there would be the server answering the very
   * request that asked to be spared it, so it ends the attempt instead of looping.
   */
  const handleJoinResponse = async (response: Response, allowEmbed: boolean) => {
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
      const opened = window.open(payload.join_url, '_blank', 'noopener,noreferrer');
      // The primary path is byte-for-byte what Z2 shipped and stays that way. Only
      // the fallback — seconds after the click, past a failed CDN fetch — reports a
      // blocked popup, because only there is the block likely.
      setOutcome(
        allowEmbed || opened
          ? { kind: 'idle' }
          : { kind: 'denied', message: POPUP_BLOCKED_MESSAGE }
      );
      return;
    }

    if (payload?.mode === 'sdk') {
      if (!allowEmbed) {
        setOutcome({ kind: 'denied', message: REQUEST_FAILED_MESSAGE });
        return;
      }

      const credentials = readSdkCredentials(payload);

      // Ruling ④: Component View is desktop-only, and a malformed payload is not
      // worth guessing at. Both take the one fallback.
      if (!credentials || !supportsComponentView()) {
        await requestLinkFallback();
        return;
      }

      setDialIn(readDialIn(payload.dial_in));
      credentialsRef.current = credentials;
      setOutcome({ kind: 'preflight' });
      return;
    }

    setOutcome({ kind: 'pending' });
  };

  /**
   * Ruling ②: ask the server for the link path explicitly. Nothing else about the
   * request changes, so every gate above outcome 8 runs identically and the answer is
   * the one this caller already received before the embed existed.
   */
  const requestLinkFallback = async () => {
    credentialsRef.current = null;

    try {
      const response = await fetch(`/api/meet/session/${sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallback: LINK_FALLBACK_INTENT }),
      });
      await handleJoinResponse(response, false);
    } catch {
      setOutcome({ kind: 'denied', message: REQUEST_FAILED_MESSAGE });
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    setOutcome({ kind: 'idle' });
    // Cleared before every attempt: a block left over from an earlier answer must
    // never outlive the decision that produced it (a meeting that has since been
    // cancelled now answers 410, and the number on screen would be stale).
    setDialIn(null);
    credentialsRef.current = null;

    try {
      const response = await fetch(`/api/meet/session/${sessionId}/join`, { method: 'POST' });
      await handleJoinResponse(response, true);
    } catch {
      setOutcome({ kind: 'denied', message: REQUEST_FAILED_MESSAGE });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Mount Component View and join. Every failure between here and a joined meeting —
   * the CDN, an absent global, `init`, `join` — ends in the same place: the link the
   * server will hand over on request.
   */
  const startEmbeddedMeeting = async () => {
    // Read and cleared in the same breath. From this line on there is no copy of the
    // signature, the passcode or the ZAK anywhere but the local `credentials`.
    const credentials = credentialsRef.current;
    credentialsRef.current = null;
    const root = sdkRootRef.current;

    setBusy(true);
    setOutcome({ kind: 'joining' });

    try {
      if (!credentials || !root) {
        throw new Error('embed context missing');
      }

      const sdk = await loadMeetingSdk();
      const client = clientRef.current ?? sdk.createClient();

      // `init` once per client; a second join in the same page life reuses it, exactly
      // as it reuses the already-downloaded bundle.
      if (!clientRef.current) {
        await client.init({
          zoomAppRoot: root,
          // §20: the SDK ships es-ES. Every string GENERA writes stays es-CL.
          language: SDK_LANGUAGE,
          patchJsMedia: true,
          leaveOnPageUnload: true,
        });
        clientRef.current = client;
      }

      await client.join({
        sdkKey: credentials.sdkKey,
        signature: credentials.signature,
        meetingNumber: credentials.meetingNumber,
        userName: credentials.userName,
        password: credentials.passcode,
        customerKey: credentials.customerKey,
        // Absent — not empty — for a participant, and for a host §9 refused.
        ...(credentials.zak ? { zak: credentials.zak } : {}),
      });

      setOutcome({ kind: 'joined' });
    } catch {
      // Nothing is logged. The only values in scope are the ones §5 exists to contain.
      await requestLinkFallback();
    } finally {
      setBusy(false);
    }
  };

  const handleUseLink = async () => {
    setBusy(true);
    try {
      await requestLinkFallback();
    } finally {
      setBusy(false);
    }
  };

  const embedActive = EMBED_OUTCOMES.includes(outcome.kind);

  return (
    <div className="mt-6">
      {/* Hidden only while the preflight owns the controls — it has its own two. */}
      {outcome.kind !== 'preflight' && (
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
      )}

      {outcome.kind === 'preflight' && (
        <PreJoinCheck onContinue={startEmbeddedMeeting} onUseLink={handleUseLink} busy={busy} />
      )}

      {outcome.kind === 'joining' && (
        <p
          data-testid="meet-embed-connecting"
          role="status"
          className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
        >
          {EMBED_CONNECTING_MESSAGE}
        </p>
      )}

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

      {/*
        The SDK renders itself into this element. Mounted from the preflight onward so
        the node exists before `init` is called, and kept mounted across a second join
        in the same page life. Empty in every other state — it holds nothing of ours.
      */}
      {embedActive && (
        <div
          ref={sdkRootRef}
          data-testid="meet-embed-root"
          className="mt-3 w-full overflow-hidden rounded-lg"
        />
      )}

      {!embedActive && (
        <p className="mt-3 text-xs text-gray-500">
          La reunión se abre en un servicio externo a GENERA, en una pestaña nueva.
        </p>
      )}

      <MeetingDialIn dialIn={dialIn} />
    </div>
  );
};

export default JoinMeetingButton;
