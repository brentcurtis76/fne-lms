import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ExternalLink, Loader2 } from 'lucide-react';
import MeetingDialIn from './MeetingDialIn';
import PreJoinCheck from './PreJoinCheck';
import type { JoinDialIn } from '../../lib/utils/meeting-dial-in';
import { selectEmbedView, type EmbeddedView } from '../../lib/meet/embed-capabilities';
import {
  loadMeetingSdk,
  SDK_CALL_TIMEOUT_MS,
  SDK_LANGUAGE,
  SDK_TIMEOUT_MESSAGE,
  withTimeout,
  type ZoomEmbeddedClient,
} from '../../lib/meet/zoom-sdk-loader';
import {
  awaitClientViewCall,
  awaitClientViewFrame,
  awaitClientViewJoin,
  CLIENT_VIEW_FRAME_SRC,
  CLIENT_VIEW_LIB_BASE,
  CLIENT_VIEW_LIB_DIR,
  loadClientView,
} from '../../lib/meet/zoom-client-view-loader';

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
 * ## One view on this phase: Component View, and NOTHING ELSE IS REACHABLE (Z3-r9)
 *
 * Zoom ships the web SDK as two products. Z3 was split on 2026-08-08 (plan §15.1) and
 * ships **Component View, desktop only**; Client View becomes **Z3b**, behind a
 * Client-View-specific field protocol that does not exist yet. Its code below is kept
 * compiling as Z3b's starting point and is deliberately made **unreachable**, which is
 * a stronger claim than "hidden" and a different one from "falls back after startup".
 *
 * **The decision moved to the click, and that is the whole mechanism.** `handleJoin`
 * asks `selectEmbedView()` BEFORE it posts. If the answer is anything but `component`,
 * the very first request carries the `{ fallback: 'link' }` intent this file already
 * used after a failure — so the server never enters its SDK branch, never signs a
 * payload, and for a host **never mints a ZAK and never writes a `zoom_zak_issuances`
 * row** for a credential that would have been discarded. Nothing downstream is reached
 * because nothing downstream is ever asked for.
 *
 * **The population is NOT "mobile, tablet and Firefox".** `supportsComponentView()`
 * also refuses any viewport under 768 px, so a split-screen desktop window, a
 * low-resolution school monitor and a restored-down browser are on this path too.
 * Three user-agent cases would have missed all three of those; the standing proof is a
 * truth table over every branch of `selectEmbedView()`
 * (`__tests__/components/sessions/JoinMeetingButton.clientview.test.tsx`).
 *
 * **No wire-contract change.** `{ fallback: 'link' }` is Z3-3's ruling ②, unchanged in
 * field, value and meaning — "give me LESS than you could". Only WHEN it is sent moved.
 * PM ruling ① from r3 also stands: this component still never reads `FEATURE_ZOOM_EMBED`
 * in either half. What it reads is its own browser, which is not the server's to know —
 * the server is never told which view was chosen.
 *
 * The rules above hold identically: the same single §5 opening, the same payload, the
 * same ref that is emptied by the call that consumes it.
 *
 * ## Client View runs in its own document (Z3-r5, Sol M4)
 *
 * Client View takes the page over, and Zoom warns that global framework CSS conflicts
 * with it. This app's `styles/globals.css` is imported by `pages/_app.tsx`, which wraps
 * every page — and Next's Pages Router permits a global stylesheet in `_app` and nowhere
 * else, so no route can opt out. A dedicated page would satisfy plan §15's wording
 * ("Client View route") while leaving the actual defect in place: `init` and `join` can
 * SUCCEED against a broken layout, which is a failure class the catch-based fallback
 * cannot see at all.
 *
 * So Client View renders inside a same-origin frame whose document
 * (`CLIENT_VIEW_FRAME_SRC`) is a static file, served without the app pipeline and
 * carrying none of the app's CSS. Nothing else about the path changes: the same one §5
 * opening, the same credentials read from a ref and dropped by the call that consumes
 * them — they cross into the frame as arguments to a function call, never as a URL, a
 * prop, an attribute or a message payload — and the same `{fallback:'link'}` on any
 * failure.
 *
 * ## Zoom's pre-join screen IS the preflight, on Client View (Z3-r8, owner ruling)
 *
 * Client View answers `join`'s success callback only after a person presses Zoom's own
 * «Entrar». r7 proved that three ways — devices present or absent makes no difference,
 * `disablePreview` does not suppress the screen, and a human click settles the join in
 * 5.9 s — and the owner ruled that the screen is the intended UX rather than a defect:
 * it is the vendor's device check, in the meeting's own context, with the controls that
 * actually govern the join.
 *
 * Three things follow, and all three are in this file:
 *
 * **① No `PreJoinCheck` on this path.** Two device checks and two clicks to join one
 * meeting is worse than one, and Zoom's is the better of the two. Component View is a
 * widget with no preview screen at all — the gap r3 built `PreJoinCheck` for — so there
 * it renders exactly as it did.
 *
 * **② The join is started by the render, not by a click.** With no preflight there is no
 * user gesture between "credentials arrived" and "mount the frame", and
 * `joinWithClientView` needs a frame React has already committed. So the response opens
 * the frame and an effect below starts the join once the element exists.
 *
 * **③ A GENERA way out, for as long as Zoom's screen is up.** That screen takes the
 * whole viewport and carries nothing of ours, so without this a user who would rather
 * just open the link has nowhere to press — permanently, now that no deadline ends the
 * wait. It is the same `{fallback:'link'}` second request the preflight's escape hatch
 * makes; there is no new server surface.
 */

interface JoinMeetingButtonProps {
  sessionId: string;
}

/** §8: approve enqueues provisioning; the projection row lands seconds later. */
const PENDING_MESSAGE = 'Enlace en preparación';

/** Network/parse failure — the only copy this component authors itself. */
const REQUEST_FAILED_MESSAGE = 'No pudimos preparar el acceso a la reunión. Intenta nuevamente.';

/** The escape hatch's label — deliberately the same words as the preflight's. */
const USE_LINK_LABEL = 'Abrir Zoom en otra pestaña';

/**
 * What the fallback says once it has asked for a tab (Z3-r5, Sol M1).
 *
 * It does NOT claim the tab was blocked, because this page cannot know. Per the HTML
 * standard `window.open()` returns `null` whenever `noopener` is set — successfully or
 * not — so the previous version inferred "blocked" from a value that carries no
 * information, and told EVERY user of the fallback that their popup had been refused.
 *
 * The value is not made informative by dropping `noopener,noreferrer`; a security
 * property is not a detection signal to trade away. So detection is abandoned and the
 * user gets Sol's other shape instead: a real link, right here. Its activation is a
 * genuine user gesture, which is what a popup blocker keys on — so unlike the old retry
 * button, it cannot itself be refused.
 */
const LINK_OPENED_MESSAGE = 'Abrimos Zoom en una pestaña nueva. Si no la ves, usa el enlace:';

/** Shown while the SDK downloads and connects. */
const EMBED_CONNECTING_MESSAGE = 'Conectando a la reunión…';

/**
 * What the escape hatch says while Zoom's own screen is up (Z3-r8).
 *
 * Short because on Client View it sits on top of the vendor's viewport-filling UI and
 * has to be readable at a glance without competing with it. es-CL, like every string
 * this app authors.
 */
const EMBED_USE_LINK_HINT = '¿Prefieres abrir Zoom aparte?';

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
  /**
   * The fallback asked for a tab and cannot know whether it got one, so it keeps the
   * URL on screen as a link. Only the FALLBACK reaches this state — the primary link
   * path stays exactly the `idle` it has been since Z2.
   */
  | { kind: 'link'; url: string }
  | { kind: 'denied'; message: string }
  /** Credentials in hand, preflight on screen, nothing mounted yet. */
  | { kind: 'preflight'; view: EmbeddedView }
  | { kind: 'joining'; view: EmbeddedView }
  | { kind: 'joined'; view: EmbeddedView };

/**
 * The view whose root element this tree owns right now, or `null` when it owns none.
 * Exactly one of the two roots is ever mounted, and only in these three states.
 */
function embeddedView(outcome: JoinOutcome): EmbeddedView | null {
  return outcome.kind === 'preflight' || outcome.kind === 'joining' || outcome.kind === 'joined'
    ? outcome.view
    : null;
}

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
  /** Client View is bootstrapped once per FRAME, exactly as `clientRef` is per client. */
  const clientViewReadyRef = useRef(false);
  const clientFrameRef = useRef<HTMLIFrameElement | null>(null);
  /**
   * Which join attempt is current (Z3-r8).
   *
   * A Client View join is no longer bounded by a deadline, so it can still be in flight
   * when the user abandons it through the escape hatch. The attempt that was abandoned
   * must not later resolve into a joined meeting, and its failure must not fire a SECOND
   * link fallback on top of the one the user already asked for.
   */
  const attemptRef = useRef(0);
  /**
   * A Client View join waiting for React to commit the frame it needs (Z3-r8, ②). Set
   * by the response, consumed once by the effect below.
   */
  const pendingClientJoinRef = useRef(false);
  /** The frame's window, once its document has loaded. Waiting for it twice is pointless. */
  const clientHostRef = useRef<Window | null>(null);
  /**
   * Whether the isolated Client View document is mounted. Separate from `outcome`
   * because the frame must outlive the states around a join: it is mounted at the
   * preflight so its document loads early, and it holds a bootstrapped `ZoomMtg` that a
   * second join in the same page life reuses. It comes down only when the user leaves
   * the meeting, which takes the bootstrap with it.
   */
  const [clientFrameOpen, setClientFrameOpen] = useState(false);

  /**
   * Turns one join response into what the user sees.
   *
   * `allowEmbed` is false for every request that already asked for link mode — the
   * post-failure fallback, and since Z3-r9 the FIRST request from a browser that cannot
   * host Component View. It is what makes those requests terminal: a `mode: 'sdk'` in
   * answer to a request that asked to be spared it is the server contradicting the one
   * thing the client said, so it ends the attempt instead of looping.
   *
   * `keepLinkOnScreen` is a separate question and only the FALLBACK answers it yes. A
   * browser that asked for the link up front is on the primary path, seconds after a
   * click, and gets byte-for-byte what Z2 shipped it; the fallback lands past a failed
   * embed, where a browser is likeliest to have refused the tab, and leaves the URL
   * on screen as a real link.
   */
  const handleJoinResponse = async (
    response: Response,
    { allowEmbed, keepLinkOnScreen }: { allowEmbed: boolean; keepLinkOnScreen: boolean }
  ) => {
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
      // Return value deliberately unread: under `noopener` it is `null` either way.
      window.open(payload.join_url, '_blank', 'noopener,noreferrer');
      // The primary path is byte-for-byte what Z2 shipped and stays that way — for the
      // Component-View-capable browser AND for the one that asked for the link up front.
      // Only the fallback — past a failed CDN fetch, where a browser is likeliest to
      // refuse the tab — keeps the link on screen afterwards.
      setOutcome(keepLinkOnScreen ? { kind: 'link', url: payload.join_url } : { kind: 'idle' });
      return;
    }

    if (payload?.mode === 'sdk') {
      if (!allowEmbed) {
        setOutcome({ kind: 'denied', message: REQUEST_FAILED_MESSAGE });
        return;
      }

      const credentials = readSdkCredentials(payload);
      // Asked AGAIN, after the round trip. `handleJoin` already refused to request an
      // embed this browser cannot host, so on this line the answer is normally the same
      // one — but a window can be resized while the request is in flight, and Z3 ships
      // Component View or nothing. Anything else here takes the link.
      const view = selectEmbedView();

      // A browser that is no longer a Component View browser, and a malformed payload
      // that is not worth guessing at, take the same one fallback.
      if (!credentials || view !== 'component') {
        await requestLinkFallback();
        return;
      }

      setDialIn(readDialIn(payload.dial_in));
      credentialsRef.current = credentials;

      // Component View is a widget with no preview screen — r3's gap, and where the
      // preflight still earns its place.
      setOutcome({ kind: 'preflight', view });
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
      await handleJoinResponse(response, { allowEmbed: false, keepLinkOnScreen: true });
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

    // Z3-r9: asked BEFORE the request, not after it. This is the whole unreachability
    // mechanism — a browser Component View cannot serve asks for link mode on its FIRST
    // request, so no SDK payload is signed for it, no ZAK is minted for a host on it,
    // no `zoom_zak_issuances` row is written, and nothing on the Client View path is
    // reached because nothing ever asks it for anything.
    const canHostComponentView = selectEmbedView() === 'component';

    try {
      const response = await fetch(
        `/api/meet/session/${sessionId}/join`,
        canHostComponentView
          ? { method: 'POST' }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fallback: LINK_FALLBACK_INTENT }),
            }
      );
      await handleJoinResponse(response, {
        allowEmbed: canHostComponentView,
        // Still the primary path for these browsers, and it stays what Z2 shipped.
        keepLinkOnScreen: false,
      });
    } catch {
      setOutcome({ kind: 'denied', message: REQUEST_FAILED_MESSAGE });
    } finally {
      setBusy(false);
    }
  };

  /** Mount Component View into this page's own root element and join. */
  const joinWithComponentView = async (credentials: EmbedCredentials) => {
    const root = sdkRootRef.current;
    if (!root) throw new Error('embed context missing');

    const sdk = await loadMeetingSdk();
    const client = clientRef.current ?? sdk.createClient();

    // `init` once per client; a second join in the same page life reuses it, exactly
    // as it reuses the already-downloaded bundle. Both calls are bounded (Sol M3): an
    // SDK that answers neither way used to leave this promise pending forever, and the
    // fallback below only starts from a rejection.
    if (!clientRef.current) {
      await withTimeout(
        client.init({
          zoomAppRoot: root,
          // §20: the SDK ships es-ES. Every string GENERA writes stays es-CL.
          language: SDK_LANGUAGE,
          patchJsMedia: true,
          leaveOnPageUnload: true,
        }),
        SDK_CALL_TIMEOUT_MS,
        SDK_TIMEOUT_MESSAGE
      );
      clientRef.current = client;
    }

    await withTimeout(
      client.join({
        sdkKey: credentials.sdkKey,
        signature: credentials.signature,
        meetingNumber: credentials.meetingNumber,
        userName: credentials.userName,
        password: credentials.passcode,
        customerKey: credentials.customerKey,
        // Absent — not empty — for a participant, and for a host §9 refused.
        ...(credentials.zak ? { zak: credentials.zak } : {}),
      }),
      SDK_CALL_TIMEOUT_MS,
      SDK_TIMEOUT_MESSAGE
    );
  };

  /**
   * The meeting is over. The frame goes, and the bootstrap goes with it: `ZoomMtg`
   * lived on that window, so a later join must mount a fresh frame and bootstrap again.
   */
  const handleClientViewLeave = () => {
    clientViewReadyRef.current = false;
    clientHostRef.current = null;
    setClientFrameOpen(false);
    setOutcome({ kind: 'idle' });
  };

  /**
   * Hand the isolated frame to Client View and join. The bootstrap sequence and the
   * callback shape are Zoom's, not a choice — see `zoom-client-view-loader.ts`.
   *
   * ⚠ **Z3b. Unreachable on this phase and kept compiling on purpose** (see the file
   * header): nothing sets `pendingClientJoinRef`, so the effect that would call this
   * never fires and `runEmbeddedJoin` never receives `'client'`. Do not re-admit a
   * caller here without the Client-View-specific field protocol §16 now requires — the
   * open findings this code carries (Sol M1/M2/M3) moved to Z3b WITH it.
   */
  const joinWithClientView = async (credentials: EmbedCredentials) => {
    const frame = clientFrameRef.current;
    if (!frame) throw new Error('embed context missing');

    // Everything below runs against the frame's window and document, not this page's.
    const host = clientHostRef.current ?? (await awaitClientViewFrame(frame));
    clientHostRef.current = host;
    const sdk = await loadClientView(host);

    if (!clientViewReadyRef.current) {
      sdk.setZoomJSLib(CLIENT_VIEW_LIB_BASE, CLIENT_VIEW_LIB_DIR);
      sdk.preLoadWasm();
      sdk.prepareWebSDK();
      // §20: the SDK ships es-ES. Every string GENERA writes stays es-CL.
      //
      // AWAITED, and before `init` (Sol M2): Zoom's localization loads the language
      // resources asynchronously, and an `init` that starts first initialises the SDK
      // in en-US, switching to es-ES only if the load happens to settle in time.
      await withTimeout(
        Promise.resolve(sdk.i18n.load(SDK_LANGUAGE)),
        SDK_CALL_TIMEOUT_MS,
        SDK_TIMEOUT_MESSAGE
      );

      await awaitClientViewCall((callbacks) =>
        sdk.init({
          // Leaving the meeting returns the FRAME to its own empty document, which is
          // how this page learns the meeting is over (see the mount below). The path
          // carries nothing Zoom-shaped and no session identifier.
          leaveUrl: host.location.href,
          patchJsMedia: true,
          leaveOnPageUnload: true,
          ...callbacks,
        })
      );
      clientViewReadyRef.current = true;
    }

    // Z3-r8: the ONE call on this path that finishes when a person acts. Its deadline
    // bounds Zoom putting a screen up, and stops there — see `awaitClientViewJoin`.
    await awaitClientViewJoin(host, (callbacks) =>
      sdk.join({
        sdkKey: credentials.sdkKey,
        signature: credentials.signature,
        meetingNumber: credentials.meetingNumber,
        userName: credentials.userName,
        // Client View spells the passcode `passWord`; Component View spells it
        // `password`. Same value, two vendor APIs.
        passWord: credentials.passcode,
        customerKey: credentials.customerKey,
        // Absent — not empty — for a participant, and for a host §9 refused.
        ...(credentials.zak ? { zak: credentials.zak } : {}),
        ...callbacks,
      })
    );

    // From here the frame's next `load` means one thing: Zoom navigated it to
    // `leaveUrl` because the user left. Attached only after a join succeeded, so the
    // frame's own first load — which this join waited on — cannot trigger it.
    frame.addEventListener('load', handleClientViewLeave, { once: true });
  };

  /**
   * Join through whichever view the response's browser check chose. Every failure
   * between here and a joined meeting — the CDN, an absent global, `init`, `join` —
   * ends in the same place: the link the server will hand over on request.
   *
   * The attempt number is captured before anything is awaited: a Client View join has no
   * deadline any more, so it can still be running when the user abandons it, and neither
   * its success nor its failure may speak for the page once that has happened.
   */
  const runEmbeddedJoin = async (view: EmbeddedView) => {
    // Read and cleared in the same breath. From this line on there is no copy of the
    // signature, the passcode or the ZAK anywhere but the local `credentials`.
    const credentials = credentialsRef.current;
    credentialsRef.current = null;

    attemptRef.current += 1;
    const attempt = attemptRef.current;
    const current = () => attemptRef.current === attempt;

    setBusy(true);

    try {
      if (!credentials) {
        throw new Error('embed context missing');
      }

      // `'client'` is Z3b's branch and is unreachable on this phase — the only two
      // callers pass `'component'` (the preflight) or are themselves unreachable (the
      // effect below). Left in place because it is where Z3b resumes.
      if (view === 'client') {
        await joinWithClientView(credentials);
      } else {
        await joinWithComponentView(credentials);
      }

      if (current()) setOutcome({ kind: 'joined', view });
    } catch {
      // Nothing is logged. The only values in scope are the ones §5 exists to contain.
      if (current()) await requestLinkFallback();
    } finally {
      if (current()) setBusy(false);
    }
  };

  /** The preflight's continue button — Component View only, since Z3-r8. */
  const startEmbeddedMeeting = async (view: EmbeddedView) => {
    setOutcome({ kind: 'joining', view });
    await runEmbeddedJoin(view);
  };

  /**
   * Z3-r8 ②: the Client View join, started once the frame it needs is in the document.
   *
   * `joinWithClientView` reads `clientFrameRef`, which React populates at commit — so
   * with the preflight gone there is no longer a user gesture standing between the state
   * change that mounts the frame and the code that uses it, and this effect is that gap.
   *
   * ⚠ **Z3b. Never fires on this phase**: its three guards are `pendingClientJoinRef`,
   * a `'client'` outcome and a mounted frame, and since Z3-r9 nothing produces any of
   * the three. It is Z3b's entry point, not live code.
   */
  useEffect(() => {
    if (!pendingClientJoinRef.current) return;
    if (outcome.kind !== 'joining' || outcome.view !== 'client') return;
    if (!clientFrameRef.current) return;

    pendingClientJoinRef.current = false;
    void runEmbeddedJoin('client');
    // Deliberately keyed on the outcome alone: the effect is a one-shot guarded by the
    // ref above, not a subscription to every value the join closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  const handleUseLink = async () => {
    setBusy(true);
    try {
      await requestLinkFallback();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Z3-r8 ③: leave the embed for the link, from underneath Zoom's own screen.
   *
   * It abandons the in-flight join rather than waiting for it — the whole point is that
   * nothing is waiting on a deadline any more — so the attempt counter moves first and
   * the frame comes down with the bootstrap that lived on its window. What follows is
   * the same one `{fallback:'link'}` request the preflight's escape hatch makes.
   */
  const handleLeaveEmbedForLink = async () => {
    attemptRef.current += 1;
    pendingClientJoinRef.current = false;
    clientViewReadyRef.current = false;
    clientHostRef.current = null;
    setClientFrameOpen(false);

    setBusy(true);
    try {
      await requestLinkFallback();
    } finally {
      setBusy(false);
    }
  };

  const activeView = embeddedView(outcome);
  const embedActive = activeView !== null;

  return (
    <div className="mt-6">
      {/*
        Hidden while something else owns the controls: the preflight has its own two, and
        a join in flight has the escape hatch below. Offering "Unirse a la reunión" on top
        of Zoom's own pre-join screen would start a second attempt over the first.
      */}
      {outcome.kind !== 'preflight' && outcome.kind !== 'joining' && (
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
        <PreJoinCheck
          onContinue={() => startEmbeddedMeeting(outcome.view)}
          onUseLink={handleUseLink}
          busy={busy}
        />
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

      {/*
        Z3-r8 ③ — the GENERA affordance that survives Zoom taking the viewport.

        It lives in the `joining` state, which is now the unbounded one: from the moment
        the embed starts until the person enters the meeting, however long that is. On
        Client View it has to float ABOVE the frame's `z-50`, because that frame is the
        whole screen and this is the only thing on it that is ours. On Component View the
        embed is a widget in the page, so it sits in the flow like everything else.

        Never disabled by `busy` — a control that is only reachable during a join, and is
        switched off for the duration of that join, is not a way out.
      */}
      {outcome.kind === 'joining' && (
        <div
          className={
            outcome.view === 'client'
              ? 'fixed right-3 top-3 z-[60] flex flex-wrap items-center justify-end gap-2 rounded-lg border border-gray-300 bg-white/95 p-2 shadow-lg'
              : 'mt-2 flex flex-wrap items-center gap-2'
          }
        >
          <span className="text-xs text-gray-600">{EMBED_USE_LINK_HINT}</span>
          <button
            type="button"
            onClick={handleLeaveEmbedForLink}
            data-testid="meet-embed-use-link"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {USE_LINK_LABEL}
          </button>
        </div>
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
        Sol M1: the fallback's escape hatch, and the reason nothing here claims to know
        whether the tab opened. An anchor rather than the old retry button, because the
        old one re-ran the fallback through a fetch — landing outside the user's gesture
        again, where the same browser could refuse it again, forever. Activating a link
        is the gesture, so this one always works.
      */}
      {outcome.kind === 'link' && (
        <div
          data-testid="meet-join-link"
          role="status"
          className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
        >
          <p>{LINK_OPENED_MESSAGE}</p>
          <a
            href={outcome.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="meet-join-open-link"
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {USE_LINK_LABEL}
          </a>
        </div>
      )}

      {/*
        Component View renders itself into this element. Mounted from the preflight
        onward so the node exists before `init` is called, and kept mounted across a
        second join in the same page life. Empty in every other state — it holds nothing
        of ours.
      */}
      {activeView === 'component' && (
        <div
          ref={sdkRootRef}
          data-testid="meet-embed-root"
          className="mt-3 w-full overflow-hidden rounded-lg"
        />
      )}

      {/*
        ⚠ Z3b. NEVER MOUNTED on this phase: `clientFrameOpen` is only ever set true by
        the Client View branch of the response handler, which Z3-r9 removed. Kept so
        Z3b resumes from a working boundary rather than rebuilding one.

        Sol M4: Client View's document, and the CSS boundary this app cannot give it any
        other way. Zoom's root element lives INSIDE it — this page never mounts one — so
        the two views still cannot coexist, and now the app's global stylesheet cannot
        reach the one that takes the page over.

        `allow` is what lets the frame ask for a camera and a microphone at all: the
        parent route is granted `camera=(self), microphone=(self), display-capture=(self)`
        by `next.config.js`, and a nested context gets only what it is explicitly passed.

        Full-viewport whenever Client View is the active view — which since Z3-r8 is from
        the moment the credentials arrive, because there is no preflight of ours in front
        of it any more. It stays mounted and hidden after the user leaves a meeting and
        before the next join, which is what lets a second join reuse the bootstrap.
      */}
      {clientFrameOpen && (
        <iframe
          ref={clientFrameRef}
          src={CLIENT_VIEW_FRAME_SRC}
          title="Reunión de Zoom"
          data-testid="meet-client-root"
          allow="camera; microphone; display-capture; autoplay; fullscreen"
          className={
            activeView === 'client'
              ? 'fixed inset-0 z-50 h-full w-full border-0'
              : 'hidden'
          }
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
