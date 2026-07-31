/**
 * The `ZoomApi` seam (plan §4: "`ZoomApi` interface + in-memory fake
 * (`ZOOM_MODE=mock`), DI seam per `lib/bots/types.ts`").
 *
 * Same shape as `lib/bots/types.ts`: a narrow channel-agnostic interface, one live
 * adapter, one in-memory fake, and a factory that picks between them from env. Every
 * consumer downstream (Z1b-3's jobs, Z2's provisioning hooks) depends on the
 * interface and never on `fetch`.
 *
 * ## Surface is deliberately small
 *
 * Only the operations Z1b-3 and Z2 actually consume are here: create, read, patch and
 * delete a meeting; read back and patch meeting settings; list users for `host_sync`.
 * Recording, report and attendance operations arrive with Z4/Z7 — adding them now
 * would mean an interface, a fake and a test suite for behaviour nobody has measured
 * against the live account yet.
 *
 * ## The UUID trap is encoded in the field name
 *
 * Zoom mints a **new** meeting UUID for every occurrence. The uuid in a create
 * response, and the uuid a `GET` returns, are point-in-time reads — not the key an
 * occurrence's recordings, participants or reports hang off. The Z0B-2 ledger routed
 * this into Z1b as: capture the occurrence uuid from the `meeting.started` webhook,
 * never at provision. So the field is called `uuidAtRead`, and
 * `zoom_meetings.zoom_meeting_uuid` must never be assigned from it.
 */
import { createZoomClient, type ZoomClient, type ZoomReadBack } from './client';
import { ZoomConfigError, ZoomUnusableSuccessError } from './errors';
import { createZoomFake } from './fake';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Zoom's cloud-recording switch. Provisioning always sends `'none'` (plan §8). */
export type ZoomAutoRecording = 'none' | 'local' | 'cloud';

/** The subset of Zoom meeting settings this integration sets or reads. */
export interface ZoomMeetingSettings {
  join_before_host?: boolean;
  waiting_room?: boolean;
  auto_recording?: ZoomAutoRecording;
  mute_upon_entry?: boolean;
  meeting_authentication?: boolean;
  [key: string]: unknown;
}

export interface ZoomMeeting {
  /** The 9–11 digit meeting number. Stable across occurrences — this IS a key. */
  id: number;
  /**
   * ⚠ The uuid Zoom reported at the moment of this read — NOT an occurrence key.
   * Zoom mints a new uuid every time the meeting starts, so persisting this value as
   * `zoom_meetings.zoom_meeting_uuid` binds recordings and reports to the wrong
   * occurrence. Capture the occurrence uuid from the `meeting.started` webhook
   * instead (Z0B-2 ledger finding, routed into Z1b).
   */
  uuidAtRead: string;
  hostZoomUserId: string;
  topic: string;
  /** Chile wall-clock, no offset — paired with `timezone` (plan §10). */
  startTime: string;
  durationMinutes: number;
  timezone: string;
  joinUrl: string;
  /** Plaintext passcode. The web SDK requires it; never leaves the service layer. */
  passcode: string;
  /** EFFECTIVE settings as Zoom reports them, not what was requested. */
  settings: ZoomMeetingSettings;
  status?: string;
}

export interface CreateMeetingInput {
  /** Zoom user id or email of the licensed host (§9). */
  hostZoomUserId: string;
  topic: string;
  /** Chile wall-clock, e.g. `2026-08-05T15:00:00` — never UTC-converted here. */
  startTime: string;
  durationMinutes: number;
  /** Always `America/Santiago` for this product (plan §10). */
  timezone: string;
  agenda?: string;
  passcode?: string;
  settings?: ZoomMeetingSettings;
}

export interface PatchMeetingInput {
  topic?: string;
  startTime?: string;
  durationMinutes?: number;
  timezone?: string;
  agenda?: string;
}

/** Zoom's `type` field: 1 = Basic, 2 = Licensed, 3 = On-prem. */
export type ZoomUserLicenseType = 1 | 2 | 3;

export interface ZoomUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** §9: only Licensed users enter `zoom_internal.zoom_hosts`. */
  licenseType: ZoomUserLicenseType;
  status: string;
}

export interface ListUsersOptions {
  status?: 'active' | 'inactive' | 'pending';
  pageSize?: number;
  nextPageToken?: string;
}

export interface ListUsersResult {
  users: ZoomUser[];
  nextPageToken?: string;
}

/** §9: cloud recording requires a Licensed host, so Basic users are excluded. */
export function isLicensedHost(user: ZoomUser): boolean {
  return user.licenseType === 2 && user.status === 'active';
}

export interface ZoomApi {
  createMeeting(input: CreateMeetingInput): Promise<ZoomMeeting>;
  /** The read-back operation. Also the only way to confirm a settings PATCH. */
  getMeeting(meetingNumber: number): Promise<ZoomMeeting>;
  patchMeeting(meetingNumber: number, patch: PatchMeetingInput): Promise<void>;
  deleteMeeting(meetingNumber: number): Promise<void>;
  /** Effective settings only — never what was requested. */
  getMeetingSettings(meetingNumber: number): Promise<ZoomMeetingSettings>;
  /**
   * PATCH + read-back in one operation, because the PATCH answers 204 with an empty
   * body and silently coerces an invalid enum. The returned `drift` is the
   * settings-drift signal §12/§18 alerts on — and it keys on `auto_recording`, never
   * on `recording_disclaimer` (ledger §9.4).
   */
  patchMeetingSettings(
    meetingNumber: number,
    settings: ZoomMeetingSettings
  ): Promise<ZoomReadBack<ZoomMeetingRaw>>;
  listUsers(options?: ListUsersOptions): Promise<ListUsersResult>;
}

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

/** Zoom's meeting object as it comes off the wire. Exported for the read-back type. */
export interface ZoomMeetingRaw extends Record<string, unknown> {
  id: number;
  uuid: string;
  host_id: string;
  topic: string;
  start_time: string;
  duration: number;
  timezone: string;
  join_url: string;
  password?: string;
  status?: string;
  settings?: ZoomMeetingSettings;
}

interface ZoomUserRaw {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  type: number;
  status?: string;
}

export function mapMeeting(raw: ZoomMeetingRaw): ZoomMeeting {
  return {
    id: raw.id,
    uuidAtRead: raw.uuid,
    hostZoomUserId: raw.host_id,
    topic: raw.topic,
    startTime: raw.start_time,
    durationMinutes: raw.duration,
    timezone: raw.timezone,
    joinUrl: raw.join_url,
    passcode: raw.password ?? '',
    settings: raw.settings ?? {},
    status: raw.status,
  };
}

/**
 * Shape-checks a create response BEFORE `mapMeeting` casts it (Sol R2 ①).
 *
 * `mapMeeting` is a total function over a type it is merely ASSERTED to receive, so a
 * 201 whose body is `{}` mapped cleanly to a "meeting" with `id: undefined` and
 * `joinUrl: undefined` — and `meeting_provision` then wrote `status: 'provisioned'`
 * onto a row with no meeting number and completed. The row said provisioned, nothing
 * existed to join, and the manual-reconciliation path R1-F4 built was bypassed.
 *
 * ## What is checked, and why exactly this set
 *
 * The fields `meeting_provision` PERSISTS or JOINS WITH, and no others:
 *
 *  - `id` → `zoom_meetings.zoom_meeting_number`, the anchor that means "Zoom holds a
 *    meeting for this surface, never create a second one". A non-integer or ≤ 0 value
 *    is not a meeting number. `isSafeInteger` rather than `isFinite`: past 2^53 the
 *    value has ALREADY lost precision in JSON.parse, so it names a different meeting.
 *  - `join_url` → `zoom_meetings.join_url`, the only thing a participant can act on.
 *  - `password` → `zoom_meetings.passcode`, and `settings` → `effective_settings`.
 *    Both are FAIL-CLOSED — REQUIRED, not merely type-checked when present (Sol R3 ②).
 *    `meeting_provision` sends a passcode and a settings object on EVERY create, so a
 *    2xx carrying neither is anomalous, and `mapMeeting`'s documented `?? ''` / `?? {}`
 *    coercions turn that absence into a persisted EMPTY passcode — a meeting nobody can
 *    join, on a row that says `provisioned` — and an empty `effective_settings`. The
 *    second is the worse half: §9.4 reads drift off `effective_settings.auto_recording`
 *    and an absent value floors to `'none'`, which is exactly the value that means
 *    "clean run". So `settings` must also carry an EXPLICIT string `auto_recording`:
 *    the drift signal is only meaningful when Zoom actually stated the value, and a
 *    silence that reads as compliance is worse than a refusal a human can see.
 *
 * NOT checked: `uuid`, `host_id`, `topic`, `start_time`, `duration`, `timezone`. The
 * provisioner deliberately persists none of them (`zoom_meeting_uuid` stays NULL — see
 * the `uuidAtRead` note above), so rejecting a create over a field nobody stores would
 * turn a usable response into an ambiguous outcome that needs a human. Widen this set
 * when a consumer starts persisting one of them, not before.
 *
 * Returns the problems as field-level strings. Values are NEVER interpolated — these
 * strings reach `zoom_jobs.last_error` under the message discipline in `errors.ts`.
 */
export function findUnusableCreateFields(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return ['body is not a JSON object'];
  }
  const body = raw as Record<string, unknown>;
  const problems: string[] = [];

  if (typeof body.id !== 'number' || !Number.isSafeInteger(body.id) || body.id <= 0) {
    problems.push('id is not a positive integer meeting number');
  }
  if (typeof body.join_url !== 'string' || body.join_url.trim() === '') {
    problems.push('join_url is missing or empty');
  }
  if (typeof body.password !== 'string' || body.password.trim() === '') {
    problems.push('password is missing or not a non-empty string');
  }
  const settings = body.settings;
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    problems.push('settings is missing or not an object');
  } else if (typeof (settings as Record<string, unknown>).auto_recording !== 'string') {
    problems.push('settings.auto_recording is missing or not a string');
  }
  return problems;
}

/**
 * The SAME requirement set as `findUnusableCreateFields`, applied to a meeting that has
 * already been through `mapMeeting`. Its one caller is `meeting_provision`'s
 * operator-recovery read-back (Sol R3 ①): the row's meeting number came from a human
 * who reconciled a parked ambiguous create against Zoom, so a `getMeeting` is the only
 * place the passcode, the join_url and the effective settings can come from — and they
 * must clear exactly the bar a create response clears before they are persisted.
 *
 * Checking AFTER the map is not a weaker check. `mapMeeting`'s coercions are lossless
 * for this purpose: an absent `password` arrives as `''` and absent `settings` as an
 * object with no `auto_recording`, which are precisely the two states the create rules
 * reject. And it leaves GET semantics alone — `getMeeting` still maps whatever Zoom
 * sends, for every other reader; only this one refuses to PERSIST an unusable result.
 */
export function findUnusableProvisionedMeetingFields(meeting: ZoomMeeting): string[] {
  return findUnusableCreateFields({
    id: meeting.id,
    join_url: meeting.joinUrl,
    password: meeting.passcode,
    settings: meeting.settings,
  });
}

function mapUser(raw: ZoomUserRaw): ZoomUser {
  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.first_name ?? '',
    lastName: raw.last_name ?? '',
    licenseType: (raw.type as ZoomUserLicenseType) ?? 1,
    status: raw.status ?? 'active',
  };
}

// ---------------------------------------------------------------------------
// Live adapter
// ---------------------------------------------------------------------------

export function createLiveZoomApi(client: ZoomClient = createZoomClient()): ZoomApi {
  const meetingPath = (meetingNumber: number) => `/meetings/${meetingNumber}`;

  async function readMeeting(meetingNumber: number): Promise<ZoomMeetingRaw> {
    const response = await client.get<ZoomMeetingRaw>(meetingPath(meetingNumber));
    if (!response.data) {
      throw new ZoomConfigError(`Zoom returned no body for GET ${meetingPath(meetingNumber)}.`);
    }
    return response.data;
  }

  return {
    async createMeeting(input) {
      const response = await client.post<ZoomMeetingRaw>(
        // Path segment, so an email host id must be encoded.
        `/users/${encodeURIComponent(input.hostZoomUserId)}/meetings`,
        {
          topic: input.topic,
          type: 2, // scheduled
          start_time: input.startTime,
          duration: input.durationMinutes,
          // Wall-clock plus zone, never a UTC conversion (plan §10).
          timezone: input.timezone,
          ...(input.agenda === undefined ? {} : { agenda: input.agenda }),
          ...(input.passcode === undefined ? {} : { password: input.passcode }),
          ...(input.settings === undefined ? {} : { settings: input.settings }),
        }
      );
      // ---------------------------------------------------------------------
      // The three unusable-2xx bodies, all one outcome (Sol F4, Sol R2 ①)
      //
      // Zoom accepted the request; the response does not say what it produced. Empty,
      // schema-invalid and — raised one layer down in `client.ts` — unparseable are the
      // same fact about a non-idempotent verb: the meeting MAY exist and we cannot name
      // it. `ZoomUnusableSuccessError` carries `outcome: 'ambiguous'` as a class
      // invariant, so none of these can read as a definite pre-create rejection merely
      // because the status was 2xx. `status` + `requestId` ride along on all three:
      // `x-zm-request-id` is what a Zoom support ticket needs, and it is the only
      // identifier an ambiguous create ever produces.
      // ---------------------------------------------------------------------
      const context = {
        status: response.status,
        operation: `POST /users/{id}/meetings`,
        requestId: response.requestId,
      };

      if (!response.data) {
        throw new ZoomUnusableSuccessError('Zoom returned no body for a meeting create.', context);
      }

      // BEFORE `mapMeeting`, whose cast is unchecked by construction: a valid-JSON body
      // that is not a meeting maps to a meeting-shaped object full of `undefined`, and
      // the provisioner persists that as a provisioned row with no number.
      const problems = findUnusableCreateFields(response.data);
      if (problems.length > 0) {
        throw new ZoomUnusableSuccessError(
          `Zoom answered a meeting create with a body this integration cannot use: ${problems.join('; ')}.`,
          context
        );
      }

      // The create response reflects EFFECTIVE settings on a capability mismatch, so
      // the caller must read `settings` off this object rather than assume its input.
      return mapMeeting(response.data);
    },

    async getMeeting(meetingNumber) {
      return mapMeeting(await readMeeting(meetingNumber));
    },

    async patchMeeting(meetingNumber, patch) {
      await client.patch(meetingPath(meetingNumber), {
        ...(patch.topic === undefined ? {} : { topic: patch.topic }),
        ...(patch.startTime === undefined ? {} : { start_time: patch.startTime }),
        ...(patch.durationMinutes === undefined ? {} : { duration: patch.durationMinutes }),
        ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
        ...(patch.agenda === undefined ? {} : { agenda: patch.agenda }),
      });
    },

    async deleteMeeting(meetingNumber) {
      await client.del(meetingPath(meetingNumber));
    },

    async getMeetingSettings(meetingNumber) {
      return (await readMeeting(meetingNumber)).settings ?? {};
    },

    async patchMeetingSettings(meetingNumber, settings) {
      // There is no `/meetings/{id}/settings` endpoint — settings ride on the
      // meeting PATCH and are read back off the meeting GET (spike-verified).
      return client.patchWithReadBack<ZoomMeetingRaw>(
        meetingPath(meetingNumber),
        settings,
        meetingPath(meetingNumber),
        {
          patchBody: { settings },
          select: (data) => data.settings,
        }
      );
    },

    async listUsers(options = {}) {
      const response = await client.get<{ users?: ZoomUserRaw[]; next_page_token?: string }>('/users', {
        status: options.status ?? 'active',
        page_size: options.pageSize ?? 300,
        next_page_token: options.nextPageToken,
      });
      return {
        users: (response.data?.users ?? []).map(mapUser),
        // Zoom sends an empty string rather than omitting the field on the last page.
        nextPageToken: response.data?.next_page_token || undefined,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type ZoomMode = 'live' | 'mock';

/**
 * `ZOOM_MODE` (§14). Unset means `live`, because the environment most likely to
 * have it unset is production and silently mocking there would make provisioning a
 * no-op that reports success. Any OTHER value throws rather than falling back — a
 * typo like `Mock` must not become `live` by accident.
 */
export function resolveZoomMode(env: NodeJS.ProcessEnv = process.env): ZoomMode {
  const mode = env.ZOOM_MODE;
  if (mode === undefined || mode === '' || mode === 'live') return 'live';
  if (mode === 'mock') return 'mock';
  throw new ZoomConfigError(`ZOOM_MODE must be 'live' or 'mock'; received '${mode}'.`);
}

let mockSingleton: ZoomApi | null = null;

export function getZoomApi(env: NodeJS.ProcessEnv = process.env): ZoomApi {
  if (resolveZoomMode(env) === 'mock') {
    // A singleton, so mock state persists across calls within one process — a job
    // that provisions and a later job that reads must see the same meeting.
    if (!mockSingleton) mockSingleton = createZoomFake();
    return mockSingleton;
  }
  return createLiveZoomApi();
}

/** Resets the process-wide mock. Test-only; a live process never calls it. */
export function resetZoomApiForTests(): void {
  mockSingleton = null;
}
