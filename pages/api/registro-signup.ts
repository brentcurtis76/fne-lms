import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit } from '../../lib/rateLimit';
import { handleSignupSubmission } from '../../lib/signupSubmission';
import {
  GENERAL_SIGNUP_SOURCE,
  findGenerationForSchool,
  isValidUuid,
  normalizeText,
} from '../../lib/signups';

const submitRateLimit = rateLimit({ limit: 5, windowMs: 60 * 1000 }, 'registro-signup');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return handleSignupSubmission(req, res, {
    source: GENERAL_SIGNUP_SOURCE,
    logPrefix: 'registro-signup',
    rateLimiter: submitRateLimit,
    validateSchool: async (supabase, schoolId) => {
      const { data: school, error } = await supabase
        .from('schools')
        .select('id')
        .eq('id', schoolId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return school?.id ? null : 'Colegio inválido';
    },
    // Generation is optional; when provided it must belong to the chosen school.
    resolveGeneration: async (supabase, body, schoolId) => {
      const rawGenerationId = normalizeText(body.generationId);
      if (!rawGenerationId) {
        return { generationId: null };
      }
      if (!isValidUuid(rawGenerationId)) {
        return { error: 'Generación inválida' };
      }
      const generationBelongsToSchool = await findGenerationForSchool(
        supabase,
        rawGenerationId,
        schoolId
      );
      if (!generationBelongsToSchool) {
        return { error: 'Generación inválida para el colegio seleccionado' };
      }
      return { generationId: rawGenerationId };
    },
  });
}
