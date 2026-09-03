import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  handleMethodNotAllowed,
  logApiRequest,
  sendApiError,
  sendApiResponse,
  sendAuthError,
} from '../../../lib/api-auth';
import { checkZoomRolloutPolicy } from '../../../lib/zoom/provisioning-intent';
import { isOperatorTenant, readSchoolTenantControls } from '../../../lib/types/tenant-kind';

/**
 * Stable structural reason codes (FNE Zoom internal test plan §4.4). The two rollout codes
 * are the `ZoomRolloutRefusal` vocabulary verbatim; the two tenant codes are this route's.
 * User-facing prose for them is the creation UI's concern, not this route's.
 */
export type SessionZoomCapabilityReason =
  | 'feature_disabled'
  | 'school_not_allowlisted'
  | 'tenant_not_operator'
  | 'operator_testing_disabled'
  | 'qa_provider_suppressed';

export interface SessionZoomCapabilities {
  school_id: number;
  /** True exactly when the shared §14 rollout policy passes for this school. */
  managed_zoom_allowed: boolean;
  /**
   * True only when the requester is a live admin, the school row is `tenant_kind =
   * 'operator'` with `internal_zoom_testing_enabled = true`, and the rollout policy passes.
   */
  operator_test_creation_allowed: boolean;
  /** Every reason a capability above is false. Empty when both are true. */
  reasons: SessionZoomCapabilityReason[];
}

/**
 * GET /api/sessions/capabilities?school_id=<positive integer>
 *
 * "For this school, would a managed Zoom meeting be provisioned, and may this admin create
 * an FNE operator test session?" — answered for a session that does not exist yet.
 *
 * Deliberately calls `checkZoomRolloutPolicy`, never `checkProvisionGate`: the full gate
 * evaluates source-state eligibility, and a draft is not `programada`, so it would refuse
 * every draft. Tenant kind and the enablement flag come from the school row only — nothing
 * about them is accepted from the request. The session POST repeats every check
 * server-side; this response is advisory for the UI and authorizes nothing by itself.
 *
 * Exposes no configuration values, no allowlist contents, and no school or user data
 * beyond the echoed id and the reason codes.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-capabilities');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, user } = await checkIsAdmin(req, res);
  if (!user) {
    return sendAuthError(res, 'No autenticado', 401);
  }
  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden consultar esta capacidad', 403);
  }

  const schoolId = parseSchoolIdQuery(req.query.school_id);
  if (schoolId === null) {
    return sendApiError(res, 'school_id debe ser un entero positivo', 400);
  }

  const lookup = await readSchoolTenantControls(createServiceRoleClient(), schoolId);
  switch (lookup.status) {
    case 'found':
      break;
    case 'not_found':
      return sendApiError(res, 'El colegio solicitado no existe', 404);
    case 'error':
      return sendApiError(res, 'Error al verificar el colegio', 500, lookup.message);
    case 'invalid_tenant_kind':
    case 'invalid_row':
      return sendApiError(res, 'La clasificación del colegio no es válida', 500);
  }

  const school = lookup.school;
  const reasons: SessionZoomCapabilityReason[] = [];

  const rollout = checkZoomRolloutPolicy(schoolId, process.env);
  let managedZoomAllowed = rollout === null;
  if (rollout !== null) reasons.push(rollout.reason);
  if (school.tenant_kind === 'qa') {
    managedZoomAllowed = false;
    reasons.push('qa_provider_suppressed');
  }

  // `isAdmin` is already established above; a non-admin never reaches this line.
  let operatorTestCreationAllowed = managedZoomAllowed;
  if (!isOperatorTenant(school.tenant_kind)) {
    operatorTestCreationAllowed = false;
    reasons.push('tenant_not_operator');
  } else if (school.internal_zoom_testing_enabled !== true) {
    operatorTestCreationAllowed = false;
    reasons.push('operator_testing_disabled');
  }

  const capabilities: SessionZoomCapabilities = {
    school_id: schoolId,
    managed_zoom_allowed: managedZoomAllowed,
    operator_test_creation_allowed: operatorTestCreationAllowed,
    reasons,
  };

  return sendApiResponse(res, capabilities);
}

/**
 * Exactly one query value, all digits, a safe positive integer. Arrays (a repeated
 * parameter), fractions, signs, blanks and non-numeric strings are all `null`.
 */
function parseSchoolIdQuery(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}
