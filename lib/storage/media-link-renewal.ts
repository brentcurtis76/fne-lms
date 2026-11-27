// F26b send-back 1: a video or an audio played from an Espacio file route
// (pages/api/community/post-media/[id].ts, pages/api/community/message-attachments/[id].ts)
// keeps playing after its five-minute link has run out.
//
// The route answers a redirect to a link signed for five minutes; the browser
// then asks that link for one range of the file after another. A long video,
// a slow line, a long pause or a seek late in the file asks for a range after
// the link has expired, the store answers 400 and the player stops with a
// network error. Here the player then asks the ROUTE again (load() re-runs the
// source selection; the route's answers are never stored, so the request
// reaches the app and passes its permission check again), and continues at
// the same position, playing if it was playing. The link itself never lives
// longer than five minutes, and nobody who may not see the file gets a link.
//
// One renewal at a time: if the renewed source fails before it can play (the
// route refuses, the file is gone, the file cannot be decoded), the caller's
// giveUp shows the usual error instead of trying again.
//
// Send-back 2: an error within RENEWAL_MIN_INTERVAL_MS (60 seconds) of the
// previous renewal also gives up, even when the renewed source reached
// `canplay` in between. A link lives five minutes, so such an error is not an
// expired link (a damaged stretch of the file, or a line on which every reload
// fails again); without this rule error -> load -> canplay -> error could ask
// the route again without end. An error later than that renews again.

const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_DECODE = 3;

/**
 * A link lives five minutes, so an error sooner than this after the previous
 * renewal is not an expired link: give up instead of renewing again.
 */
export const RENEWAL_MIN_INTERVAL_MS = 60_000;

interface RenewalState {
  renewing: boolean;
  position: number;
  resume: boolean;
  /** Date.now() of the last renewal; kept when renewalSettled clears `renewing`. */
  renewedAt: number;
}

const states = new WeakMap<HTMLMediaElement, RenewalState>();

/** The media element's `error` event (a range request failed, e.g. 400 after expiry). */
export function renewMediaLinkOnError(media: HTMLMediaElement, giveUp: () => void): void {
  const code = media.error?.code;
  if (code === MEDIA_ERR_ABORTED) return;
  const state = states.get(media);
  const now = Date.now();
  const tooSoon = state !== undefined && now - state.renewedAt < RENEWAL_MIN_INTERVAL_MS;
  if (code === MEDIA_ERR_DECODE || state?.renewing || tooSoon) {
    states.delete(media);
    giveUp();
    return;
  }
  const position = Number.isFinite(media.currentTime) ? media.currentTime : 0;
  states.set(media, { renewing: true, position, resume: !media.paused, renewedAt: now });
  media.load();
}

/**
 * A `<source>` element's `error` event: the source could not be fetched at
 * all (the route refused, the file is gone). Not renewed: the caller's giveUp
 * shows the usual error, on the first load as before and after a renewal.
 */
export function mediaSourceFailed(media: HTMLMediaElement | null, giveUp: () => void): void {
  if (media) states.delete(media);
  giveUp();
}

/** The media element's `loadedmetadata` event: back to the position, playing again if it was. */
export function resumeAfterRenewal(media: HTMLMediaElement): void {
  const state = states.get(media);
  if (!state?.renewing) return;
  if (state.position > 0) media.currentTime = state.position;
  if (state.resume) {
    const played = media.play();
    if (played && typeof played.catch === 'function') played.catch(() => undefined);
  }
}

/** The media element's `canplay` event: the renewal worked; a later expiry may renew again. */
export function renewalSettled(media: HTMLMediaElement): void {
  const state = states.get(media);
  if (state?.renewing) states.set(media, { ...state, renewing: false });
}
