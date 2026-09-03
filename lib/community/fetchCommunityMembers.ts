/**
 * Community member candidates for the Espacio Colaborativo pickers.
 *
 * The only sanctioned browser-side source of member candidates is
 * `GET /api/community/members`. That endpoint authorizes the requester for the
 * exact community on the server (admin or active member) and then reads the
 * community's active roles and profiles with the service client, so the
 * caller neither leaks the whole platform to an admin nor hides co-members
 * behind the per-user `profiles` RLS.
 *
 * This helper fails closed on purpose: a non-2xx response, an unparsable body
 * or a body without a `members` array all throw, and the caller renders an
 * empty list plus an error. There is deliberately no fallback to a
 * browser-side `profiles` / `user_roles` / `community_workspaces` query — that
 * fallback is precisely the scope leak this module exists to prevent.
 */

export interface CommunityMemberRole {
  role_type: string;
}

/** Minimal member shape the pickers consume. Extra endpoint fields are ignored. */
export interface CommunityMember {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  /** Ordered most-significant-first by the endpoint (`rolePriorityIndex`). */
  user_roles?: CommunityMemberRole[];
}

export class CommunityMembersRequestError extends Error {
  /** HTTP status of the failed response, or null when no response was read. */
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'CommunityMembersRequestError';
    this.status = status;
  }
}

export function communityMembersUrl(communityId: string): string {
  return `/api/community/members?community_id=${encodeURIComponent(communityId)}`;
}

function isCommunityMember(value: unknown): value is CommunityMember {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/**
 * Load the active members of one community through the access-controlled
 * endpoint. Rejects on any non-2xx status, on a body that is not JSON, and on
 * a JSON body whose `members` property is not an array. Pass an `AbortSignal`
 * to cancel the request on close/unmount; an aborted request rejects with the
 * `AbortError` the runtime raises, which callers treat as "no result".
 */
export async function fetchCommunityMembers(
  communityId: string,
  options: { signal?: AbortSignal } = {},
): Promise<CommunityMember[]> {
  const response = await fetch(communityMembersUrl(communityId), {
    method: 'GET',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new CommunityMembersRequestError(
      `Community members request failed with status ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CommunityMembersRequestError(
      'Community members response is not valid JSON',
      response.status,
    );
  }

  const members = (payload as { members?: unknown } | null)?.members;
  if (!Array.isArray(members)) {
    throw new CommunityMembersRequestError(
      'Community members response has no members array',
      response.status,
    );
  }

  // Entries without a string id can never be selected; drop them rather than
  // letting a malformed row crash the picker.
  return members.filter(isCommunityMember);
}
