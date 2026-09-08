/**
 * The sole low-level account-creation primitive. Routes pass explicit fields;
 * this module constructs the Supabase payload itself as a fixed inline literal
 * and exposes no generic attributes bag that could gain a password through a
 * spread. The boundary guard (scripts/ci/check-browser-boundaries.mjs) pins the
 * payload's exact keys AND requires the policy call below to exist, so removing
 * either fails CI structurally rather than by convention.
 *
 * THE PASSWORD POLICY IS ENFORCED HERE, at the boundary, not only in callers.
 * Every account this platform creates therefore inherits the shared policy
 * even if a future route forgets its own early check — caller-side checks
 * remain purely for earlier, friendlier UX errors.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { firstPasswordPolicyError } from './password-policy';

export interface ProvisionAuthAccountInput {
  email: string;
  password: string;
  emailConfirm: boolean;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
}

type ProvisionResult = Awaited<ReturnType<SupabaseClient['auth']['admin']['createUser']>>;

export async function provisionAuthAccount(
  admin: SupabaseClient,
  input: ProvisionAuthAccountInput
): Promise<ProvisionResult> {
  const policyError = firstPasswordPolicyError(input.password);
  if (policyError) {
    // Shaped like the provider's own refusal so every existing caller's
    // `{ data, error }` handling treats it as a failed create. No account is
    // provisioned with a credential the shared policy rejects.
    return {
      data: { user: null },
      error: {
        name: 'AuthWeakPasswordError',
        message: policyError,
        code: 'weak_password',
        status: 400,
      },
    } as unknown as ProvisionResult;
  }

  // A fixed inline object literal — no spread, no computed key — so the
  // boundary guard can pin exactly which attributes account creation may carry.
  // Undefined metadata fields are dropped by the JSON serialization.
  return admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: input.emailConfirm,
    user_metadata: input.userMetadata,
    app_metadata: input.appMetadata,
  });
}
