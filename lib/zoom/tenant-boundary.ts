import type { TenantProviderDisposition } from '../simulation/tenant-policy';
import { resolveSchoolProviderDisposition } from '../simulation/tenant-policy';
import { ZoomNonRetryableError, ZoomRetryableError } from './errors';
import { createZoomServiceClient } from './service-client';

export type ZoomTenantGate = (schoolId: number) => Promise<TenantProviderDisposition>;

export function defaultZoomTenantGate(
  env: NodeJS.ProcessEnv = process.env
): ZoomTenantGate {
  const client = createZoomServiceClient(env);
  return (schoolId) => resolveSchoolProviderDisposition(client, schoolId);
}

export type ZoomQaSuppression = {
  skipped: 'suppressed_qa';
  school_id: number;
};

/**
 * Returns a deterministic QA completion, or null when provider work is allowed.
 * Unverifiable scope fails closed; a transient school lookup remains retryable.
 */
export async function enforceZoomTenantBoundary(params: {
  schoolId: number;
  operation: string;
  gate: ZoomTenantGate;
}): Promise<ZoomQaSuppression | null> {
  const decision = await params.gate(params.schoolId);
  if (decision.kind === 'allow') return null;
  if (decision.kind === 'suppressed_qa') {
    return { skipped: 'suppressed_qa', school_id: decision.schoolId };
  }
  if (decision.reason === 'school_lookup_failed') {
    throw new ZoomRetryableError('Zoom tenant scope could not be verified.', {
      operation: params.operation,
    });
  }
  throw new ZoomNonRetryableError(`Zoom tenant scope refused: ${decision.reason}.`, {
    operation: params.operation,
  });
}
