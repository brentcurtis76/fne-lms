import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSchoolProviderDisposition } from '../simulation/tenant-policy';

export type OutboundEmailAuthorization =
  | {
      kind: 'allow';
      scope: 'public' | 'client' | 'operator' | 'unscoped_user';
      schoolId?: number;
    }
  | { kind: 'suppressed_qa'; schoolId: number; reason: 'qa_tenant' }
  | {
      kind: 'refuse';
      reason: 'invalid_school' | 'school_lookup_failed' | 'qa_school_not_allowlisted' | 'user_lookup_failed';
    };

/** Public website messages are unambiguously outside any tenant. */
export const PUBLIC_OUTBOUND_EMAIL: OutboundEmailAuthorization = Object.freeze({
  kind: 'allow',
  scope: 'public',
});

export async function authorizeSchoolEmail(
  client: SupabaseClient,
  schoolId: unknown
): Promise<OutboundEmailAuthorization> {
  const decision = await resolveSchoolProviderDisposition(client, schoolId);
  if (decision.kind === 'suppressed_qa') {
    return { kind: 'suppressed_qa', schoolId: decision.schoolId, reason: 'qa_tenant' };
  }
  if (decision.kind === 'refuse') {
    const reason = decision.reason === 'invalid_school_id'
      ? 'invalid_school'
      : decision.reason;
    return { kind: 'refuse', reason };
  }
  return {
    kind: 'allow',
    scope: decision.tenantKind,
    schoolId: decision.schoolId,
  };
}

/**
 * Resolve every school attached to a user. A QA association wins over any
 * sendable association so multi-role users cannot leak mail through a client role.
 */
export async function authorizeUserEmail(
  client: SupabaseClient,
  userId: string
): Promise<OutboundEmailAuthorization> {
  if (!userId) return { kind: 'refuse', reason: 'user_lookup_failed' };

  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
    await Promise.all([
      client.from('profiles').select('school_id').eq('id', userId).maybeSingle(),
      client
        .from('user_roles')
        .select('school_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('school_id', 'is', null),
    ]);

  if (profileError || rolesError || (roles !== null && !Array.isArray(roles))) {
    return { kind: 'refuse', reason: 'user_lookup_failed' };
  }

  const ids = new Set<number>();
  const profileSchoolId = Number(profile?.school_id);
  if (Number.isSafeInteger(profileSchoolId) && profileSchoolId > 0) ids.add(profileSchoolId);
  for (const role of roles ?? []) {
    const roleSchoolId = Number(role?.school_id);
    if (Number.isSafeInteger(roleSchoolId) && roleSchoolId > 0) ids.add(roleSchoolId);
  }

  if (ids.size === 0) return { kind: 'allow', scope: 'unscoped_user' };

  let allowed: OutboundEmailAuthorization | null = null;
  for (const schoolId of ids) {
    const decision = await authorizeSchoolEmail(client, schoolId);
    if (decision.kind === 'suppressed_qa') return decision;
    if (decision.kind === 'refuse') return decision;
    allowed = decision;
  }
  return allowed ?? { kind: 'refuse', reason: 'user_lookup_failed' };
}

/**
 * Resolve a legacy tenant-less recipient list without silently treating an
 * invalid school id as client traffic. Any QA association suppresses the whole
 * batch; any failed user lookup refuses it before the provider is constructed.
 */
export async function authorizeRecipientUsersEmail(
  client: SupabaseClient,
  userIds: string[]
): Promise<OutboundEmailAuthorization> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    return { kind: 'refuse', reason: 'user_lookup_failed' };
  }
  if (uniqueIds.length === 0) return { kind: 'allow', scope: 'unscoped_user' };

  const decisions = await Promise.all(uniqueIds.map((id) => authorizeUserEmail(client, id)));
  const qaDecision = decisions.find((decision) => decision.kind === 'suppressed_qa');
  if (qaDecision?.kind === 'suppressed_qa') return qaDecision;
  const refusal = decisions.find((decision) => decision.kind === 'refuse');
  if (refusal?.kind === 'refuse') return refusal;
  return decisions[0] ?? { kind: 'allow', scope: 'unscoped_user' };
}
