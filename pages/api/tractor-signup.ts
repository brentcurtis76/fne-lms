import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, isValidSchoolIdInput } from '../../lib/api-auth';
import { trackFormSubmission } from '../../lib/formSubmissionTracker';
import { rateLimit } from '../../lib/rateLimit';
import {
  TRACTOR_SIGNUP_SOURCE,
  getFullName,
  isSantaMartaSchoolId,
  isTractorSignupRole,
  isValidBirthDate,
  isValidEmail,
  normalizeEmail,
  normalizeText,
} from '../../lib/tractorSignups';

const submitRateLimit = rateLimit({ limit: 5, windowMs: 60 * 1000 }, 'tractor-signup');

interface TractorSignupRequest {
  firstName?: string;
  lastName?: string;
  schoolId?: string | number;
  email?: string;
  birthDate?: string;
  profession?: string;
  role?: string;
  consentAccepted?: boolean | string;
  website?: string;
}

const FIELD_LIMITS = {
  firstName: 80,
  lastName: 80,
  profession: 140,
};

function isConsentAccepted(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await submitRateLimit(req, res);
  if (!allowed) return;

  try {
    const body = (req.body ?? {}) as TractorSignupRequest;

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
      firstName.length > FIELD_LIMITS.firstName ||
      lastName.length > FIELD_LIMITS.lastName ||
      profession.length > FIELD_LIMITS.profession
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
    const schoolAllowed = await isSantaMartaSchoolId(supabase, schoolId);
    if (!schoolAllowed) {
      return res.status(400).json({ error: 'Colegio inválido para este registro' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('tractor_signups')
      .select('id, status')
      .eq('email_normalized', email)
      .maybeSingle();

    if (existingError) {
      if (existingError.code === '42P01') {
        return res.status(503).json({ error: 'Formulario temporalmente no disponible' });
      }
      console.error('[tractor-signup] existing lookup failed:', existingError);
      return res.status(500).json({ error: 'Error al procesar el registro' });
    }

    if (existing?.status === 'granted') {
      return res.status(200).json({
        success: true,
        alreadyGranted: true,
        message: 'Tu acceso ya fue gestionado.',
      });
    }

    const signupPayload = {
      source: TRACTOR_SIGNUP_SOURCE,
      first_name: firstName,
      last_name: lastName,
      email,
      email_normalized: email,
      school_id: schoolId,
      birth_date: birthDate,
      profession,
      role,
      status: 'pending',
      consent_accepted_at: new Date().toISOString(),
      linked_user_id: null,
      granted_by: null,
      granted_at: null,
    };

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('tractor_signups')
        .update(signupPayload)
        .eq('id', existing.id);

      if (updateError) {
        console.error('[tractor-signup] update failed:', updateError);
        return res.status(500).json({ error: 'Error al actualizar el registro' });
      }
    } else {
      const { error: insertError } = await supabase.from('tractor_signups').insert(signupPayload);

      if (insertError) {
        console.error('[tractor-signup] insert failed:', insertError);
        return res.status(500).json({ error: 'Error al guardar el registro' });
      }
    }

    await trackFormSubmission(supabase, {
      senderEmail: email,
      senderName: getFullName(firstName, lastName),
      formType: 'tractor_signup',
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[tractor-signup] unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
