import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit } from '../../lib/rateLimit';
import { handleSignupSubmission } from '../../lib/signupSubmission';
import { TRACTOR_SIGNUP_SOURCE, isSantaMartaSchoolId } from '../../lib/signups';

const submitRateLimit = rateLimit({ limit: 5, windowMs: 60 * 1000 }, 'tractor-signup');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return handleSignupSubmission(req, res, {
    source: TRACTOR_SIGNUP_SOURCE,
    logPrefix: 'tractor-signup',
    rateLimiter: submitRateLimit,
    validateSchool: async (supabase, schoolId) =>
      (await isSantaMartaSchoolId(supabase, schoolId)) ? null : 'Colegio inválido para este registro',
  });
}
