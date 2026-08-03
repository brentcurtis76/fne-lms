/**
 * In-memory `ZoomApi` for `ZOOM_MODE=mock` (plan §4, §14; CI/e2e/dev).
 *
 * A fake is only worth having if it is wrong in the same places the real thing is.
 * A fake that cheerfully honours every setting and hands back a stable UUID would
 * let Z1b-3 and Z2 build tests that pass here and fail against Zoom. So this one
 * reproduces the three traps the Z0B-2 spike measured on the live account, and each
 * has a behavioural test in `__tests__/lib/zoom/fake.test.ts`:
 *
 * **1. The meeting UUID rotates per occurrence.** `createMeeting` mints a
 * provision-time uuid; `startOccurrence()` mints a *different* one, and every read
 * afterwards reports the new value. The ledger routed this into Z1b as: capture the
 * occurrence uuid from `meeting.started`, never at provision. A consumer that
 * persists the create-time uuid as the occurrence key will see this fake disagree
 * with itself, which is the point.
 *
 * **2. A settings PATCH answers 204 with an empty body, and coerces silently.** An
 * `auto_recording` value Zoom does not recognise comes back as `'none'` — the
 * fail-safe direction, but not the requested one, and invisible from the status
 * code. `PATCH {settings:{}}` is a true no-op that preserves the current value
 * rather than clearing it (also spike-measured).
 *
 * **3. Create responses reflect EFFECTIVE settings.** Asking for cloud recording on
 * a host that is not Licensed yields `'none'` in the create response, because cloud
 * recording requires a Licensed host (§9) and Zoom reflects the effective value on a
 * capability mismatch (§20). The caller must read the response, not its own input.
 */
import { UNVERIFIABLE_SETTINGS_FIELDS, type ZoomReadBack, type ZoomSettingsDrift } from './client';
import { ZoomNonRetryableError } from './errors';
import type {
  CreateMeetingInput,
  ListUsersOptions,
  ListUsersResult,
  PatchMeetingInput,
  ZoomApi,
  ZoomAutoRecording,
  ZoomMeeting,
  ZoomMeetingRaw,
  ZoomMeetingSettings,
  ZoomUser,
} from './api';

const VALID_AUTO_RECORDING: readonly ZoomAutoRecording[] = ['none', 'local', 'cloud'];

interface FakeMeeting {
  id: number;
  uuid: string;
  provisionUuid: string;
  hostZoomUserId: string;
  topic: string;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  joinUrl: string;
  passcode: string;
  settings: ZoomMeetingSettings;
  status: 'waiting' | 'started' | 'finished';
  deleted: boolean;
}

export interface ZoomFakeControls {
  /** Drops every meeting and user, and rewinds the deterministic id counters. */
  reset(): void;
  /** Seeds the inventory `host_sync` reads (§9). */
  setUsers(users: ZoomUser[]): void;
  /**
   * Models `meeting.started`: Zoom mints a NEW uuid for this occurrence. Returns
   * both so a test can assert they differ.
   */
  startOccurrence(meetingNumber: number): { occurrenceUuid: string; previousUuid: string };
  endOccurrence(meetingNumber: number): void;
  /** Everything currently held, for assertions. */
  listMeetings(): ZoomMeeting[];
}

export type ZoomFake = ZoomApi & ZoomFakeControls;

export function createZoomFake(): ZoomFake {
  const meetings = new Map<number, FakeMeeting>();
  let users: ZoomUser[] = [];
  let meetingCounter = 0;
  let uuidCounter = 0;

  /**
   * Deterministic, and deliberately carries `+` and `/`. Zoom's real UUIDs contain
   * both, which is why every path use must be double-encoded; a fake that minted
   * clean hex would retire the exemplar and leave the encoding rule untested.
   */
  function mintUuid(): string {
    uuidCounter += 1;
    const seed = String(uuidCounter).padStart(4, '0');
    return `Fk+SyntheticUuid/${seed}==`;
  }

  function mintMeetingNumber(): number {
    meetingCounter += 1;
    // 11 digits in the 8xxxxxxxxxx range, matching the fixture library's convention.
    return 82000000000 + meetingCounter;
  }

  function requireMeeting(meetingNumber: number): FakeMeeting {
    const meeting = meetings.get(meetingNumber);
    if (!meeting || meeting.deleted) {
      // The live client turns Zoom's 404 into exactly this class.
      throw new ZoomNonRetryableError(`Zoom meeting ${meetingNumber} does not exist.`, {
        status: 404,
        zoomCode: 3001,
        operation: `GET /meetings/${meetingNumber}`,
      });
    }
    return meeting;
  }

  function isLicensed(hostZoomUserId: string): boolean {
    const user = users.find((candidate) => candidate.id === hostZoomUserId || candidate.email === hostZoomUserId);
    // Unknown hosts are treated as Licensed so a test that never seeds users still
    // exercises the ordinary path; the capability trap is opt-in via setUsers().
    return user === undefined ? true : user.licenseType === 2;
  }

  /**
   * Trap 2 + 3: coerce exactly as Zoom does. An unrecognised value becomes 'none';
   * cloud recording on a non-Licensed host becomes 'none'.
   */
  function effectiveAutoRecording(requested: unknown, hostZoomUserId: string): ZoomAutoRecording {
    if (typeof requested !== 'string' || !VALID_AUTO_RECORDING.includes(requested as ZoomAutoRecording)) {
      return 'none';
    }
    if (requested === 'cloud' && !isLicensed(hostZoomUserId)) return 'none';
    return requested as ZoomAutoRecording;
  }

  function applySettings(meeting: FakeMeeting, requested: ZoomMeetingSettings): void {
    for (const [key, value] of Object.entries(requested)) {
      if (key === 'auto_recording') {
        meeting.settings.auto_recording = effectiveAutoRecording(value, meeting.hostZoomUserId);
        continue;
      }
      meeting.settings[key] = value;
    }
  }

  function toRaw(meeting: FakeMeeting): ZoomMeetingRaw {
    return {
      id: meeting.id,
      uuid: meeting.uuid,
      host_id: meeting.hostZoomUserId,
      topic: meeting.topic,
      start_time: meeting.startTime,
      duration: meeting.durationMinutes,
      timezone: meeting.timezone,
      join_url: meeting.joinUrl,
      password: meeting.passcode,
      status: meeting.status,
      settings: { ...meeting.settings },
    };
  }

  function toDomain(meeting: FakeMeeting): ZoomMeeting {
    return {
      id: meeting.id,
      uuidAtRead: meeting.uuid,
      hostZoomUserId: meeting.hostZoomUserId,
      topic: meeting.topic,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      timezone: meeting.timezone,
      joinUrl: meeting.joinUrl,
      passcode: meeting.passcode,
      settings: { ...meeting.settings },
      status: meeting.status,
    };
  }

  return {
    // ---- ZoomApi ----------------------------------------------------------
    async createMeeting(input: CreateMeetingInput) {
      const id = mintMeetingNumber();
      const uuid = mintUuid();
      const meeting: FakeMeeting = {
        id,
        uuid,
        provisionUuid: uuid,
        hostZoomUserId: input.hostZoomUserId,
        topic: input.topic,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        timezone: input.timezone,
        // No passcode in the URL: §5 keeps `embed_password_in_join_link` off, and the
        // SDK path needs the plaintext passcode separately anyway.
        joinUrl: `https://example-synthetic.test/j/${id}`,
        passcode: input.passcode ?? String(100000 + (id % 900000)),
        settings: {
          join_before_host: false,
          waiting_room: false,
          auto_recording: 'none',
        },
        status: 'waiting',
        deleted: false,
      };
      if (input.settings) applySettings(meeting, input.settings);
      meetings.set(id, meeting);
      // Trap 3: the response carries EFFECTIVE settings, not the requested ones.
      return toDomain(meeting);
    },

    async getMeeting(meetingNumber: number) {
      return toDomain(requireMeeting(meetingNumber));
    },

    async patchMeeting(meetingNumber: number, patch: PatchMeetingInput) {
      const meeting = requireMeeting(meetingNumber);
      if (patch.topic !== undefined) meeting.topic = patch.topic;
      if (patch.startTime !== undefined) meeting.startTime = patch.startTime;
      if (patch.durationMinutes !== undefined) meeting.durationMinutes = patch.durationMinutes;
      if (patch.timezone !== undefined) meeting.timezone = patch.timezone;
    },

    async deleteMeeting(meetingNumber: number) {
      requireMeeting(meetingNumber).deleted = true;
    },

    async getMeetingSettings(meetingNumber: number) {
      return { ...requireMeeting(meetingNumber).settings };
    },

    async patchMeetingSettings(meetingNumber: number, settings: ZoomMeetingSettings) {
      const meeting = requireMeeting(meetingNumber);
      // Trap 2: `{}` is a true no-op that preserves, not a clear.
      applySettings(meeting, settings);

      const effective = { ...meeting.settings };
      const drift: ZoomSettingsDrift[] = [];
      const unverifiable: string[] = [];
      for (const [key, value] of Object.entries(settings)) {
        if (UNVERIFIABLE_SETTINGS_FIELDS.includes(key)) {
          unverifiable.push(key);
          continue;
        }
        if (JSON.stringify(effective[key]) !== JSON.stringify(value)) {
          drift.push({ key, requested: value, effective: effective[key] });
        }
      }

      const readBack: ZoomReadBack<ZoomMeetingRaw> = {
        // Trap 2: 204, empty body. The GET below is the only confirmation.
        patchStatus: 204,
        effective: toRaw(meeting),
        matches: drift.length === 0,
        drift,
        unverifiable,
      };
      return readBack;
    },

    async listUsers(options: ListUsersOptions = {}): Promise<ListUsersResult> {
      const status = options.status ?? 'active';
      return { users: users.filter((user) => user.status === status) };
    },

    // ---- Controls ---------------------------------------------------------
    reset() {
      meetings.clear();
      users = [];
      meetingCounter = 0;
      uuidCounter = 0;
    },

    setUsers(next: ZoomUser[]) {
      users = [...next];
    },

    startOccurrence(meetingNumber: number) {
      const meeting = requireMeeting(meetingNumber);
      const previousUuid = meeting.uuid;
      // Trap 1: a NEW uuid per occurrence. This is what `meeting.started` carries.
      meeting.uuid = mintUuid();
      meeting.status = 'started';
      return { occurrenceUuid: meeting.uuid, previousUuid };
    },

    endOccurrence(meetingNumber: number) {
      requireMeeting(meetingNumber).status = 'finished';
    },

    listMeetings() {
      return [...meetings.values()].filter((meeting) => !meeting.deleted).map(toDomain);
    },
  };
}
