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
 *
 * **4. A ZAK is a perishable bearer credential, not a per-host constant** (Z3-2). A
 * fake that answered `getUserZak` with the same happy string forever would let a
 * consumer cache one — and §5 says fetched at start-click, never persisted. So this
 * one mints a FRESH token per call, `expireZaks()` makes every token handed out so
 * far stale, `isZakLive()` is the oracle that tells a cached one from a fresh one,
 * and `setZak(id, null)` models the identity Zoom refuses to issue for at all.
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
  ZoomDialInNumber,
  ZoomMeeting,
  ZoomMeetingRaw,
  ZoomMeetingSettings,
  ZoomUser,
} from './api';

const VALID_AUTO_RECORDING: readonly ZoomAutoRecording[] = ['none', 'local', 'cloud'];

/**
 * The dial-in set an audio-plan tenant reports (§ Z2-4d). SYNTHETIC NUMBERS ONLY —
 * `+56 2 5555 xxxx` is inside Chile's reserved-for-fiction 55xx block and reaches
 * nobody; never put a real phone number in a fixture (Ley 21.719 discipline applies to
 * every identifier, not only student PII).
 *
 * Default-on because the blocking CI path runs `ZOOM_MODE=mock`: a fake that returned
 * nothing here would leave the capture exercised by no test that gates a merge. Tenants
 * WITHOUT an audio plan are the other half of the truth — model them with
 * `setDialInNumbers(null)`.
 */
const SYNTHETIC_DIAL_IN_NUMBERS: readonly ZoomDialInNumber[] = [
  { country: 'CL', country_name: 'Chile', city: 'Santiago', number: '+56 2 5555 0100', type: 'toll' },
  { country: 'CL', country_name: 'Chile', city: 'Valparaíso', number: '+56 32 5555 0101', type: 'toll' },
];

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
  /**
   * Models the tenant's audio plan: the dial-in set every subsequent `createMeeting`
   * reports under `settings.global_dial_in_numbers`. Pass `null` for a tenant with no
   * audio plan — Zoom then omits the key entirely, which must still provision.
   */
  setDialInNumbers(numbers: ZoomDialInNumber[] | null): void;
  /**
   * Pins what `getUserZak` answers for one host identity. A string is a fixed
   * fixture token; `null` models the identity Zoom will not issue for at all (not
   * a Zoom user, or one this app cannot read a token for) and makes the call throw
   * the same 404 class the live client raises.
   */
  setZak(zoomUserId: string, zak: string | null): void;
  /**
   * Models the ~2 h expiry (trap 4): every ZAK handed out so far is now stale.
   * Nothing about the strings changes — `isZakLive` is what stops recognising
   * them, exactly as Zoom stops accepting a token that still looks fine.
   */
  expireZaks(): void;
  /** Is this a ZAK this fake handed out AND has it not been expired since? */
  isZakLive(zak: string): boolean;
  /** Everything currently held, for assertions. */
  listMeetings(): ZoomMeeting[];
}

export type ZoomFake = ZoomApi & ZoomFakeControls;

export function createZoomFake(): ZoomFake {
  const meetings = new Map<number, FakeMeeting>();
  let users: ZoomUser[] = [];
  let meetingCounter = 0;
  let uuidCounter = 0;
  let dialInNumbers: ZoomDialInNumber[] | null = [...SYNTHETIC_DIAL_IN_NUMBERS];
  /** Per-identity override; a `null` VALUE is "Zoom refuses", absent is "mint one". */
  const zakOverrides = new Map<string, string | null>();
  /** Tokens handed out and not yet expired — the whole of `isZakLive`'s knowledge. */
  const liveZaks = new Set<string>();
  let zakCounter = 0;

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

  /**
   * Deterministic and OBVIOUSLY synthetic. A real ZAK is an opaque ~1 kB blob; the
   * point of this shape is that a leak into a log, a fixture or an audit row is
   * greppable in a way a random-looking string is not.
   */
  function mintZak(): string {
    zakCounter += 1;
    return `Fk+SyntheticZak/${String(zakCounter).padStart(4, '0')}==`;
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
      // Derived from `settings` exactly as `mapMeeting` derives it from the wire, so a
      // consumer cannot pass here and fail against the real client.
      dialInNumbers: Array.isArray(meeting.settings.global_dial_in_numbers)
        ? [...meeting.settings.global_dial_in_numbers]
        : null,
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
          // Omitted entirely, not set to null, when the tenant has no audio plan —
          // that is how Zoom reports it, and the difference is what the NULL-column
          // path is tested against.
          ...(dialInNumbers === null
            ? {}
            : { global_dial_in_numbers: dialInNumbers.map((entry) => ({ ...entry })) }),
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

    async getUserZak(zoomUserId: string) {
      const override = zakOverrides.get(zoomUserId);
      if (override === null) {
        // The live client turns Zoom's "user does not exist / no token for you" into
        // exactly this class; 1001 is Zoom's numeric code for it.
        throw new ZoomNonRetryableError(`Zoom cannot issue a ZAK for this user.`, {
          status: 404,
          zoomCode: 1001,
          operation: 'GET /users/{id}/token',
        });
      }
      // Trap 4: fresh per call, as Zoom mints one per request. An override is a fixed
      // fixture token and is re-registered as live so a test can pin the value.
      const zak = override ?? mintZak();
      liveZaks.add(zak);
      return zak;
    },

    // ---- Controls ---------------------------------------------------------
    reset() {
      meetings.clear();
      users = [];
      meetingCounter = 0;
      uuidCounter = 0;
      dialInNumbers = [...SYNTHETIC_DIAL_IN_NUMBERS];
      zakOverrides.clear();
      liveZaks.clear();
      zakCounter = 0;
    },

    setZak(zoomUserId: string, zak: string | null) {
      zakOverrides.set(zoomUserId, zak);
    },

    expireZaks() {
      liveZaks.clear();
    },

    isZakLive(zak: string) {
      return liveZaks.has(zak);
    },

    setUsers(next: ZoomUser[]) {
      users = [...next];
    },

    setDialInNumbers(next: ZoomDialInNumber[] | null) {
      dialInNumbers = next === null ? null : next.map((entry) => ({ ...entry }));
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
