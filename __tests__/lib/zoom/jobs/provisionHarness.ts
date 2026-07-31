/**
 * Shared in-memory doubles for the Z1b-4 provisioning suites.
 *
 * The point of this harness is that the store double MODELS THE EXCLUDE CONSTRAINT.
 * A double that accepted every insert would make the §9 host-busy test assert nothing:
 * the handler would "try the next candidate" in a world where the first one never
 * failed. So `insertReservation` / `reserveExistingMeeting` here re-implement
 * `zoom_meetings_host_no_overlap` — same active statuses, same ±15/+45 window — and
 * answer `reserved: false` exactly where Postgres answers 23P01.
 *
 * Every identifier is synthetic: `.test` TLD, `8xxxxxxxxxx` meeting numbers, opaque
 * Zoom-shaped user ids.
 */
import { vi } from 'vitest';
import type {
  MeetingProvisionStore,
  ProjectionUpsert,
  ProvisionHostRow,
  ProvisionMeetingRow,
  ProvisionSessionRow,
  ProvisionedMeetingPatch,
  ReservationInsert,
  ReservationOutcome,
  SessionFacilitatorRow,
} from '../../../../lib/zoom/jobs/meeting-provision';
import {
  RESERVATION_LEAD_MINUTES,
  RESERVATION_TRAIL_MINUTES,
} from '../../../../lib/zoom/jobs/meeting-provision';
import type {
  ClaimZoomJobsArgs,
  CompleteZoomJobArgs,
  FailZoomJobArgs,
  HeartbeatZoomJobArgs,
  ZoomJobInsert,
  ZoomJobRow,
  ZoomJobStatus,
  ZoomMeetingStatus,
  ZoomSurfaceType,
} from '../../../../lib/zoom/db-types';
import { ZOOM_MEETING_ACTIVE_STATUSES } from '../../../../lib/zoom/db-types';
import type { EnqueueResult, ZoomJobQueue } from '../../../../lib/zoom/jobs/queue';

const MINUTE_MS = 60_000;

// ---------------------------------------------------------------------------
// zoom_meetings double
// ---------------------------------------------------------------------------

export interface StoredMeeting {
  id: string;
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  host_zoom_user_id: string | null;
  zoom_meeting_number: number | null;
  zoom_meeting_uuid: string | null;
  passcode: string | null;
  join_url: string | null;
  effective_settings: Record<string, unknown> | null;
  status: ZoomMeetingStatus;
  starts_at: string;
  duration_minutes: number;
  last_error: string | null;
}

function windowOf(startsAtIso: string, durationMinutes: number): [number, number] {
  const start = Date.parse(startsAtIso);
  return [
    start - RESERVATION_LEAD_MINUTES * MINUTE_MS,
    start + (durationMinutes + RESERVATION_TRAIL_MINUTES) * MINUTE_MS,
  ];
}

function windowsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function isActive(status: ZoomMeetingStatus): boolean {
  return (ZOOM_MEETING_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export interface ProvisionHarnessSeed {
  session: ProvisionSessionRow;
  facilitators?: SessionFacilitatorRow[];
  hosts: ProvisionHostRow[];
  meetings?: StoredMeeting[];
}

export function createMemoryProvisionStore(seed: ProvisionHarnessSeed) {
  const meetings: StoredMeeting[] = [...(seed.meetings ?? [])];
  const projection = new Map<string, ProjectionUpsert>();
  let idCounter = 0;

  /** The EXCLUDE constraint, in TypeScript. See the module header. */
  function conflicts(
    hostZoomUserId: string,
    startsAt: string,
    durationMinutes: number,
    ignoreMeetingId: string | null
  ): boolean {
    const mine = windowOf(startsAt, durationMinutes);
    return meetings.some(
      (row) =>
        row.id !== ignoreMeetingId &&
        row.host_zoom_user_id === hostZoomUserId &&
        isActive(row.status) &&
        windowsOverlap(mine, windowOf(row.starts_at, row.duration_minutes))
    );
  }

  function project(row: StoredMeeting): ProvisionMeetingRow {
    return {
      id: row.id,
      status: row.status,
      host_zoom_user_id: row.host_zoom_user_id,
      zoom_meeting_number: row.zoom_meeting_number,
      // Read back so the resume paths can DERIVE §9.4 drift instead of assuming 'none'.
      effective_settings: row.effective_settings,
      starts_at: row.starts_at,
      duration_minutes: row.duration_minutes,
      last_error: row.last_error,
    };
  }

  const store: MeetingProvisionStore = {
    readSession: vi.fn(async (surfaceId: string) =>
      surfaceId === seed.session.id ? { ...seed.session } : null
    ),

    listFacilitators: vi.fn(async () => (seed.facilitators ?? []).map((f) => ({ ...f }))),

    listActiveHosts: vi.fn(async () => seed.hosts.map((host) => ({ ...host }))),

    countHostLoads: vi.fn(async (lowerIso: string, upperIso: string) => {
      const loads: Record<string, number> = {};
      const lower = Date.parse(lowerIso);
      const upper = Date.parse(upperIso);
      for (const row of meetings) {
        if (!isActive(row.status) || row.host_zoom_user_id === null) continue;
        const start = Date.parse(row.starts_at);
        const end = start + row.duration_minutes * MINUTE_MS;
        if (start < upper && end > lower) {
          loads[row.host_zoom_user_id] = (loads[row.host_zoom_user_id] ?? 0) + 1;
        }
      }
      return loads;
    }),

    findMeetingBySurface: vi.fn(async (surfaceType: ZoomSurfaceType, surfaceId: string) => {
      const row = meetings.find(
        (candidate) =>
          candidate.surface_type === surfaceType && candidate.surface_id === surfaceId
      );
      return row ? project(row) : null;
    }),

    insertReservation: vi.fn(async (row: ReservationInsert): Promise<ReservationOutcome> => {
      if (conflicts(row.host_zoom_user_id, row.starts_at, row.duration_minutes, null)) {
        return { reserved: false };
      }
      idCounter += 1;
      const stored: StoredMeeting = {
        id: `meeting-${idCounter}`,
        surface_type: row.surface_type,
        surface_id: row.surface_id,
        school_id: row.school_id,
        host_zoom_user_id: row.host_zoom_user_id,
        zoom_meeting_number: null,
        zoom_meeting_uuid: null,
        passcode: null,
        join_url: null,
        effective_settings: null,
        status: 'pending',
        starts_at: row.starts_at,
        duration_minutes: row.duration_minutes,
        last_error: null,
      };
      meetings.push(stored);
      return { reserved: true, row: project(stored) };
    }),

    reserveExistingMeeting: vi.fn(
      async (
        meetingId: string,
        hostZoomUserId: string,
        startsAt: string,
        durationMinutes: number
      ) => {
        if (conflicts(hostZoomUserId, startsAt, durationMinutes, meetingId)) return false;
        const row = meetings.find((candidate) => candidate.id === meetingId);
        if (!row) throw new Error(`no such meeting ${meetingId}`);
        row.host_zoom_user_id = hostZoomUserId;
        row.starts_at = startsAt;
        row.duration_minutes = durationMinutes;
        row.status = 'pending';
        row.last_error = null;
        return true;
      }
    ),

    markProvisioned: vi.fn(async (meetingId: string, patch: ProvisionedMeetingPatch) => {
      const row = meetings.find((candidate) => candidate.id === meetingId);
      if (!row) throw new Error(`no such meeting ${meetingId}`);
      row.zoom_meeting_number = patch.zoom_meeting_number;
      row.passcode = patch.passcode;
      row.join_url = patch.join_url;
      row.effective_settings = patch.effective_settings;
      row.status = patch.status;
      row.last_error = null;
    }),

    markError: vi.fn(async (meetingId: string, lastError: string) => {
      const row = meetings.find((candidate) => candidate.id === meetingId);
      if (!row) throw new Error(`no such meeting ${meetingId}`);
      row.status = 'error';
      row.last_error = lastError;
    }),

    recordLastError: vi.fn(async (meetingId: string, lastError: string) => {
      const row = meetings.find((candidate) => candidate.id === meetingId);
      if (!row) throw new Error(`no such meeting ${meetingId}`);
      // Status deliberately untouched — the row keeps its reservation.
      row.last_error = lastError;
    }),

    releaseReservation: vi.fn(async (meetingId: string, lastError: string) => {
      const row = meetings.find((candidate) => candidate.id === meetingId);
      if (!row) throw new Error(`no such meeting ${meetingId}`);
      // `cancelled` is outside ZOOM_MEETING_ACTIVE_STATUSES, so `conflicts()` above
      // stops counting this row — which is the point: the host slot is freed.
      row.status = 'cancelled';
      row.last_error = lastError;
    }),

    upsertProjection: vi.fn(async (row: ProjectionUpsert) => {
      projection.set(`${row.surface_type}:${row.surface_id}`, { ...row });
    }),
  };

  return {
    store,
    meetings,
    projection,
    /** The single row for a surface, or undefined. */
    meetingFor(surfaceId: string): StoredMeeting | undefined {
      return meetings.find((row) => row.surface_id === surfaceId);
    },
    projectionFor(surfaceId: string): ProjectionUpsert | undefined {
      return projection.get(`consultor_session:${surfaceId}`);
    },
  };
}

// ---------------------------------------------------------------------------
// zoom_jobs double
// ---------------------------------------------------------------------------

export interface StoredJob extends ZoomJobRow {}

/**
 * An in-memory `ZoomJobQueue`. Models only what the round trip needs: a claim that
 * leases runnable jobs to one worker, completion, and failure with the RPC's
 * `p_retryable → status` mapping (`false → 'failed'`).
 *
 * It does NOT model `FOR UPDATE SKIP LOCKED` — no in-process double can. That proof is
 * `scripts/ci/queue-concurrency-proof.mjs`, which runs two real tick loops against the
 * real RPC on a real Postgres.
 */
export function createMemoryJobQueue() {
  const jobs: StoredJob[] = [];
  let idCounter = 0;

  const queue: ZoomJobQueue = {
    enqueue: vi.fn(async (job: ZoomJobInsert): Promise<EnqueueResult> => {
      if (job.dedupe_key && jobs.some((row) => row.dedupe_key === job.dedupe_key)) {
        return 'duplicate';
      }
      idCounter += 1;
      jobs.push({
        id: `job-${idCounter}`,
        job_type: job.job_type,
        payload: job.payload ?? {},
        dedupe_key: job.dedupe_key ?? null,
        status: 'pending',
        attempts: 0,
        max_attempts: job.max_attempts ?? 5,
        run_after: new Date(0).toISOString(),
        lease_expires_at: null,
        heartbeat_at: null,
        stage_state: job.stage_state ?? {},
        last_error: null,
        worker_id: null,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      });
      return 'enqueued';
    }),

    claim: vi.fn(async (args: ClaimZoomJobsArgs) => {
      const claimed: ZoomJobRow[] = [];
      for (const job of jobs) {
        if (claimed.length >= (args.p_max_n ?? 1)) break;
        if (job.status !== 'pending') continue;
        job.status = 'leased';
        job.worker_id = args.p_worker_id;
        job.attempts += 1;
        claimed.push({ ...job });
      }
      return claimed;
    }),

    heartbeat: vi.fn(async (args: HeartbeatZoomJobArgs) => {
      const job = jobs.find((row) => row.id === args.p_job_id);
      if (!job || job.worker_id !== args.p_worker_id || job.status !== 'leased') return false;
      if (args.p_stage_state) job.stage_state = args.p_stage_state;
      return true;
    }),

    complete: vi.fn(async (args: CompleteZoomJobArgs) => {
      const job = jobs.find((row) => row.id === args.p_job_id);
      if (!job || job.worker_id !== args.p_worker_id) return false;
      job.status = 'done';
      // Mirrors the RPC: completion REPLACES stage_state (Z1b-3 finding ③).
      job.stage_state = args.p_stage_state ?? {};
      return true;
    }),

    fail: vi.fn(async (args: FailZoomJobArgs): Promise<ZoomJobStatus | null> => {
      const job = jobs.find((row) => row.id === args.p_job_id);
      if (!job || job.worker_id !== args.p_worker_id) return null;
      job.last_error = args.p_error;
      const retryable = args.p_retryable ?? true;
      if (!retryable) job.status = 'failed';
      else job.status = job.attempts >= job.max_attempts ? 'dead' : 'pending';
      return job.status;
    }),
  };

  return {
    queue,
    jobs,
    jobFor(jobType: string): StoredJob | undefined {
      return jobs.find((row) => row.job_type === jobType);
    },
  };
}
