/**
 * Shared core for the public signup endpoints (/api/tractor-signup and
 * /api/registro-signup). Both flows feed the same tractor_signups staging
 * table and admin panel, so their contract — honeypot fake-success, field
 * validation, dedup semantics (including re-opening dismissed signups),
 * silent 23505 success, consent timestamp — lives here exactly once.
 *
 * Server-only: imports lib/api-auth. Do not import from page components
 * (pages import the pure helpers in lib/signups.ts instead).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient, isValidSchoolIdInput } from './api-auth';
import {
  SignupSource,
  isTractorSignupRole,
  isValidBirthDate,
  isValidEmail,
  normalizeEmail,
  normalizeText,
} from './signups';

export const SIGNUP_FIELD_LIMITS = {
  firstName: 80,
  lastName: 80,
  profession: 140,
};

export interface SignupSubmissionBody {
  firstName?: string;
  lastName?: string;
  schoolId?: string | number;
  generationId?: string;
  email?: string;
  birthDate?: string;
  profession?: string;
  role?: string;
  consentAccepted?: boolean | string;
  website?: string;
}

export function isConsentAccepted(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on';
}

export interface SignupFlowConfig {
  source: SignupSource;
  logPrefix: string;
  rateLimiter: (req: NextApiRequest, res: NextApiResponse) => Promise<boolean>;
  // Resolves to null when the school is acceptable for this flow, or a
  // Spanish 400 message. Throws on lookup failure (→ 500).
  validateSchool: (supabase: SupabaseClient, schoolId: number) => Promise<string | null>;
  // Optional generation support. Resolves to the validated generation id (or
  // null when none was submitted), or an error message for a 400. Throws on
  // lookup failure (→ 500). Flows without generations omit it.
  resolveGeneration?: (
    supabase: SupabaseClient,
    body: SignupSubmissionBody,
    schoolId: number
  ) => Promise<{ generationId: string | null } | { error: string }>;
}

export async function handleSignupSubmission(
  req: NextApiRequest,
  res: NextApiResponse,
  config: SignupFlowConfig
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await config.rateLimiter(req, res);
  if (!allowed) return;

  try {
    const body = (req.body ?? {}) as SignupSubmissionBody;

    // Honeypot: respond as if the submission worked, but do not store it.
    if (normalizeText(body.website).length > 0) {
      return res.status(200).json({ success: true });
    }

    const firstName = normalizeText(body.firstName);
    const lastName = normalizeText(body.lastName);
    const email = normalizeEmail(body.email);
    const birthDate = normalizeText(body.birthDate);
    const profession = normalizeText(body.profession);
    const role = normalizeText(body.role);

    const missing = {
      firstName: !firstName,
      lastName: !lastName,
      schoolId: body.schoolId === undefined || body.schoolId === null || body.schoolId === '',
      email: !email,
      birthDate: !birthDate,
      profession: !profession,
      role: !role,
      consentAccepted: !isConsentAccepted(body.consentAccepted),
    };

    if (Object.values(missing).some(Boolean)) {
      return res.status(400).json({ error: 'Faltan campos obligatorios', missing });
    }

    if (
      firstName.length > SIGNUP_FIELD_LIMITS.firstName ||
      lastName.length > SIGNUP_FIELD_LIMITS.lastName ||
      profession.length > SIGNUP_FIELD_LIMITS.profession
    ) {
      return res.status(400).json({ error: 'Uno o más campos superan el largo permitido' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Formato de email inválido' });
    }

    if (!isValidBirthDate(birthDate)) {
      return res.status(400).json({ error: 'Fecha de nacimiento inválida' });
    }

    if (!isTractorSignupRole(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    if (!isValidSchoolIdInput(body.schoolId)) {
      return res.status(400).json({ error: 'Colegio inválido' });
    }

    const schoolId = Number(body.schoolId);
    const supabase = createServiceRoleClient();

    // The three reads are independent — run them concurrently. Error
    // precedence below preserves the original response ordering
    // (school → generation → dedup).
    const [schoolError, generationResult, dedupResult] = await Promise.all([
      config.validateSchool(supabase, schoolId),
      config.resolveGeneration
        ? config.resolveGeneration(supabase, body, schoolId)
        : Promise.resolve({ generationId: null as string | null }),
      supabase
        .from('tractor_signups')
        .select('id, status')
        .eq('email_normalized', email)
        .maybeSingle(),
    ]);

    if (schoolError) {
      return res.status(400).json({ error: schoolError });
    }

    if ('error' in generationResult) {
      return res.status(400).json({ error: generationResult.error });
    }

    const generationId = generationResult.generationId;

    const { data: existing, error: existingError } = dedupResult;
    if (existingError) {
      if (existingError.code === '42P01') {
        return res.status(503).json({ error: 'Formulario temporalmente no disponible' });
      }
      console.error(`[${config.logPrefix}] existing lookup failed:`, existingError);
      return res.status(500).json({ error: 'Error al procesar el registro' });
    }

    if (existing?.id) {
      // A dismissed signup is re-opened with the fresh submission so the
      // person shows up as pending again instead of silently disappearing.
      // Pending/granted rows keep the silent success (anti-enumeration).
      if (existing.status === 'dismissed') {
        const { error: reopenError } = await supabase
          .from('tractor_signups')
          .update({
            source: config.source,
            first_name: firstName,
            last_name: lastName,
            school_id: schoolId,
            generation_id: generationId,
            birth_date: birthDate,
            profession,
            role,
            status: 'pending',
            consent_accepted_at: new Date().toISOString(),
            linked_user_id: null,
            granted_by: null,
            granted_at: null,
          })
          .eq('id', existing.id);

        if (reopenError) {
          console.error(`[${config.logPrefix}] reopen failed:`, reopenError);
          return res.status(500).json({ error: 'Error al guardar el registro' });
        }
      }
      return res.status(200).json({ success: true });
    }

    const signupPayload = {
      source: config.source,
      first_name: firstName,
      last_name: lastName,
      email,
      email_normalized: email,
      school_id: schoolId,
      generation_id: generationId,
      birth_date: birthDate,
      profession,
      role,
      status: 'pending',
      consent_accepted_at: new Date().toISOString(),
      linked_user_id: null,
      granted_by: null,
      granted_at: null,
    };

    const { error: insertError } = await supabase.from('tractor_signups').insert(signupPayload);

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(200).json({ success: true });
      }
      console.error(`[${config.logPrefix}] insert failed:`, insertError);
      return res.status(500).json({ error: 'Error al guardar el registro' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(`[${config.logPrefix}] unexpected error:`, error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
