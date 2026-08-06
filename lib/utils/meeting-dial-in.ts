/**
 * The dial-in payload the §5 join opening may return, and the whitelist that builds it.
 *
 * ## Why this is allowed to exist at all (Z2-4e, PM ruling 1)
 *
 * A dial-in is only usable with THREE things: a phone number, the meeting number and
 * the participant passcode. The last two live in `zoom_internal` precisely because they
 * are credential-shaped. `POST /api/meet/session/[id]/join` is the plan's single
 * authorized opening through that boundary, and it already returns `join_url` — which
 * is passcode-embedded and therefore secret-equivalent — to exactly the caller entitled
 * to join. Returning the same secret in a form a human can key into a phone is the same
 * disclosure, to the same caller, through the same opening.
 *
 * It is NOT permitted anywhere else. Not in a notification payload (those are persisted
 * in the event log and rendered into e-mail), not in an .ics (a plain-text artifact that
 * outlives the reader's permissions), and not on `public.session_meetings_public`.
 *
 * ## Why this whitelists rather than passes the row through
 *
 * `zoom_meetings.dial_in_numbers` holds Zoom's array VERBATIM, and `lib/zoom/client.ts`
 * parses the wire with no field whitelist — so whatever Zoom adds to an entry tomorrow
 * is already in that column today. Spreading it into a response would publish fields
 * nobody has read. Only the four fields a human needs to place the call survive here.
 *
 * ⚠ The entry shape comes from Zoom's DOCUMENTATION, not from an observed tenant
 * response: CI runs `ZOOM_MODE=mock` and no real audio-plan tenant has ever returned
 * dial-in numbers to this code. An entry that does not carry a usable `number` is
 * dropped rather than rendered as a blank line.
 */

/** One dialable entry, reduced to what a person holding a phone actually needs. */
export interface JoinDialInNumber {
  country_name?: string;
  city?: string;
  number: string;
  type?: string;
}

/** The whole dial-in block, or nothing — never a half-usable one. */
export interface JoinDialIn {
  numbers: JoinDialInNumber[];
  /** Digits only, as a string: a bigint meeting number must not ride as a JSON number. */
  meeting_number: string;
  /** Omitted when the meeting carries no passcode — dial-in still works without one. */
  passcode?: string;
}

/** The three `zoom_meetings` columns this builder reads. All are `unknown` on purpose. */
export interface DialInSource {
  dial_in_numbers?: unknown;
  zoom_meeting_number?: unknown;
  passcode?: unknown;
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Build the dial-in block for a join response, or `null` when the meeting cannot
 * actually be joined by phone.
 *
 * `null` — never a throw, never a partial object — is the answer for every one of:
 * no audio plan (the column is NULL, which is the common case), an array of entries
 * none of which carry a number, or a meeting with no meeting number yet. A meeting
 * without dial-in is a perfectly normal meeting and must still join.
 */
export function buildJoinDialIn(source: DialInSource): JoinDialIn | null {
  if (!Array.isArray(source.dial_in_numbers)) {
    return null;
  }

  const numbers: JoinDialInNumber[] = [];

  for (const entry of source.dial_in_numbers) {
    if (typeof entry !== 'object' || entry === null) continue;

    const candidate = entry as Record<string, unknown>;
    const number = trimmedString(candidate.number);
    if (!number) continue;

    numbers.push({
      number,
      ...(trimmedString(candidate.country_name)
        ? { country_name: trimmedString(candidate.country_name) }
        : {}),
      ...(trimmedString(candidate.city) ? { city: trimmedString(candidate.city) } : {}),
      ...(trimmedString(candidate.type) ? { type: trimmedString(candidate.type) } : {}),
    });
  }

  if (numbers.length === 0) {
    return null;
  }

  // A number without the meeting number is a phone call that reaches a prompt the
  // caller cannot answer, so the whole block is withheld rather than half-shown.
  const meetingNumber =
    typeof source.zoom_meeting_number === 'number' && Number.isFinite(source.zoom_meeting_number)
      ? String(source.zoom_meeting_number)
      : trimmedString(source.zoom_meeting_number);

  if (!meetingNumber) {
    return null;
  }

  const passcode = trimmedString(source.passcode);

  return {
    numbers,
    meeting_number: meetingNumber,
    ...(passcode ? { passcode } : {}),
  };
}
