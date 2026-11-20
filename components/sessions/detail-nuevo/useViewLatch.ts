import { useRef } from 'react';
import type { Look } from '../../../lib/look';

/**
 * How long after this session's body is first drawn a new look that arrives late is still followed:
 * four seconds, the same patience as the list's opening tab.
 */
export const LATE_LOOK_WINDOW_MS = 4000;

/**
 * The view of the consultor's session page, latched (redesign 6S, release SB; the lead's decisions on
 * the second send-back and on send-back B7).
 *
 * The page's body holds two parts that should not be mounted again by a change of look: the Zoom
 * suggestions panel (it asks the server for its data when it mounts) and the audio report recorder (it
 * owns a recording in progress). So the body's view is taken from the look as it is at the first render
 * of the body (`drawing`) of one session, and kept, with one short exception (rule 2). Nothing waits:
 * while the look is unknown it counts as today's, as everywhere else.
 *
 * Three rules, in this order:
 *   1. Today's look always wins at once. When the live look is today's, today's body is drawn, on that
 *      same render, and the latch is set to today's for the rest of this session's life on the page
 *      (one way: once today's look has replaced a drawn new body, a new look that comes back later
 *      does not swap the body again, inside the four seconds or outside them). So an account whose
 *      live look is today's is never drawn the new body: not while one account replaces another in the
 *      same tab (the look provider answers today's look while the loaded profile is not the session's
 *      account's), not when that profile fails to load.
 *   2. A late new look is followed once, early. When this session's body has so far been drawn only
 *      with today's look (most often because the session's data came before the account's profile, so
 *      the look was still unknown), and the live look turns into the new one within four seconds
 *      (`LATE_LOOK_WINDOW_MS`) of the body's first drawn render, the view becomes the new one, and is
 *      held as before (rule 1 still applies after it). After those four seconds the view is held as it
 *      is: a profile more than four seconds late leaves today's view of that session until a reload or
 *      the next session.
 *   3. Otherwise the latch holds. It belongs to the session the body draws (`sessionId`, the id of the
 *      loaded session, not the address): while the address already names another session but the
 *      page still shows the previous one, the previous one keeps its view; the next session's body
 *      takes the look at its own first render and has its own four seconds.
 *
 * So the body changes view at most twice in a session's life on the page, and in the ordinary case at
 * most once, within four seconds of appearing. The cost: each change mounts the two parts again. In
 * the first four seconds the Zoom suggestions panel can be mounted a second time (it asks the server
 * once more), and so can the audio recorder: a recording begun in those seconds, before the look
 * arrived, would be lost.
 *
 * No timer and no state: the time of the first drawn render is kept here and compared with the clock
 * on the render where the look has changed (the look's change renders the page by itself). The clock
 * is `performance.now()`, which only goes forward: a wall clock set backwards cannot stretch the four
 * seconds.
 *
 * While the body is not drawn (loading, refusal, not found) the live look is returned, for the frame.
 */
export function useViewLatch({
  look,
  sessionId,
  drawing,
}: {
  look: Look;
  sessionId: string | null;
  drawing: boolean;
}): Look {
  const latch = useRef<{
    sessionId: string | null;
    look: Look;
    firstDrawnAt: number;
    drawnNuevo: boolean;
  } | null>(null);
  if (!drawing) return look;
  const held = latch.current;
  // Written while rendering, from the facts of this render: the same answer on every render after.
  if (held === null || held.sessionId !== sessionId) {
    latch.current = { sessionId, look, firstDrawnAt: performance.now(), drawnNuevo: look === 'nuevo' };
  } else if (look === 'clasico' && held.look !== 'clasico') {
    latch.current = { ...held, look: 'clasico' };
  } else if (
    look === 'nuevo' &&
    held.look === 'clasico' &&
    !held.drawnNuevo &&
    performance.now() - held.firstDrawnAt <= LATE_LOOK_WINDOW_MS
  ) {
    latch.current = { ...held, look: 'nuevo', drawnNuevo: true };
  }
  return latch.current.look;
}
