/**
 * The sole low-level account-creation primitive. Routes pass explicit fields;
 * this module constructs the Supabase payload and exposes no generic attributes
 * bag that could gain a password through a spread.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProvisionAuthAccountInput {
  email: string;
  password: string;
  emailConfirm: boolean;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
}

export async function provisionAuthAccount(
  admin: SupabaseClient,
  input: ProvisionAuthAccountInput
) {
  return admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: input.emailConfirm,
    ...(input.userMetadata ? { user_metadata: input.userMetadata } : {}),
    ...(input.appMetadata ? { app_metadata: input.appMetadata } : {}),
  });
}
