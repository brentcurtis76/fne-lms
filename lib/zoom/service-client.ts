/**
 * The service-role Supabase client the Zoom runtime uses to address
 * `zoom_internal` (plan §6: the schema is exposed in the Data API and denied by
 * GRANTS, so only the service-role key can reach it).
 *
 * Lazily constructed on purpose. Importing any Zoom module must never throw on a
 * machine without Supabase env — the verifier, the signer and the sanitizer live in
 * the same directory and their suites have no database. Every consumer therefore
 * calls this from inside a request/job, not at module scope.
 *
 * `token.ts:defaultTokenCacheStore` (Z1b-2) builds an equivalent client inline; it
 * is left alone here because its committed suite pins that construction. This module
 * is the single place the Z1b-3 runtime does it, and the natural home if the two are
 * ever unified.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ZoomConfigError } from './errors';

/**
 * Throws `ZoomConfigError` (a `ZoomNonRetryableError`) when env is absent, so a job
 * that hits it lands on triage instead of spinning against a variable no backoff
 * will create.
 */
export function createZoomServiceClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // Names only — a message must never echo a value.
    throw new ZoomConfigError(
      'Zoom service client unavailable: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.'
    );
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * `client.schema('zoom_internal')`, cast to whatever narrow structural shape the
 * caller declared. The cast is unavoidable: `types/supabase.ts` predates
 * `zoom_internal` entirely (see `lib/zoom/db-types.ts`), so the generated types and
 * the live schema are known to disagree here and nowhere else.
 *
 * Each consumer declares its OWN minimal interface — the idiom `token.ts` set with
 * `SchemaScopedClient`. A shared "whole PostgREST surface" type would be a bigger
 * lie than four small honest ones.
 */
export function zoomInternalSchema<TShape>(client: SupabaseClient): TShape {
  return client.schema('zoom_internal') as unknown as TShape;
}
