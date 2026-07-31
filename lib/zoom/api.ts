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
import { ZoomConfigError } from './errors';
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
      if (!response.data) {
        // A 2xx with an empty body on a CREATE: Zoom accepted the request and told us
        // nothing about what it made. Same class as an unparseable body — the meeting
        // may exist and we cannot name it (Sol F4), so this must not read as a definite
        // pre-create rejection just because the status was 2xx.
        throw new ZoomConfigError('Zoom returned no body for a meeting create.', {
          status: response.status,
          operation: `POST /users/{id}/meetings`,
          requestId: response.requestId,
          outcome: 'ambiguous',
        });
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
