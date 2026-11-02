/**
 * GET / POST /api/admin/pasantia-participants — FNE's roster links.
 *
 * Global admins only, with the forced-password hold before any intake query
 * (see `lib/pasantias/participants/admin.ts`). Both intake tables grant nothing
 * to authenticated callers, admins included, so this route reads and writes
 * through the service-role client.
 *
 * GET lists rosters — no participant data, only a count — newest first, at
 * most 200, with the exact total.
 *
 * POST creates a roster for one school and program and answers the link token
 * ONCE (201). Only its SHA-256 is stored; the token appears in this response
 * and in a rotate response, never anywhere else, and the hash never at all.
 * A second roster for the same school and program is `409 ROSTER_EXISTS` with
 * the existing roster's id.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ADMIN_ROSTER_SELECT,
  ROSTER_LIST_LIMIT,
  authorizeIntakeAdmin,
  expiryFromNow,
  writeWithFreshToken,
} from '../../../../lib/pasantias/participants/admin';
// Table names are written as literals at each `.from(...)` below, not imported:
// the ledger production-consumer inventory resolves only statically provable
// literal targets (an imported constant carries no string value there).
import { logIntakeFailure, toAdminRoster } from '../../../../lib/pasantias/participants/server';
import { INTAKE_COHORT } from '../../../../lib/pasantias/participants/types';
import {
  schoolNameKey,
  validateRosterCreateBody,
} from '../../../../lib/pasantias/participants/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['GET', 'POST']);
  if (!auth) return;
  const { supabase, userId } = auth;

  try {
    if (req.method === 'GET') {
      const { data, error, count } = await supabase
        .from('pasantias_intake_rosters')
        .select(ADMIN_ROSTER_SELECT, { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(ROSTER_LIST_LIMIT);
      if (error) {
        logIntakeFailure('admin roster list failed', error);
        return res.status(500).json({ error: 'Error al cargar las nóminas' });
      }
      const rosters = ((data ?? []) as unknown as Record<string, unknown>[]).map(toAdminRoster);
      return res.status(200).json({ rosters, total: typeof count === 'number' ? count : rosters.length });
    }

    const validation = validateRosterCreateBody(req.body);
    // Explicit `=== false` / `=== true`: tsconfig has strict off, and without
    // strictNullChecks only equality narrows a boolean discriminant both ways.
    if (validation.ok === false) {
      return res.status(422).json({
        code: 'VALIDATION',
        error: 'Revisa los campos marcados.',
        fields: validation.errors,
      });
    }
    const { schoolName, program, validDays } = validation.value;

    const written = await writeWithFreshToken((tokenHash) =>
      supabase
        .from('pasantias_intake_rosters')
        .insert({
          cohort: INTAKE_COHORT,
          program,
          school_name: schoolName,
          token_hash: tokenHash,
          expires_at: expiryFromNow(validDays),
          created_by: userId,
        })
        .select(ADMIN_ROSTER_SELECT)
        .maybeSingle()
    );

    if (written.ok === true) {
      return res.status(201).json({ roster: written.roster, token: written.token });
    }
    if (written.reason === 'school_exists') {
      // The generated key is lower(regexp_replace(name, '[[:space:]]+', ' ')),
      // which this mirrors for ASCII whitespace; an exotic-whitespace miss
      // answers the 409 without an id (db-contract §6).
      const { data: existing } = await supabase
        .from('pasantias_intake_rosters')
        .select('id')
        .eq('cohort', INTAKE_COHORT)
        .eq('program', program)
        .eq('school_name_key', schoolNameKey(schoolName))
        .maybeSingle();
      return res.status(409).json({
        code: 'ROSTER_EXISTS',
        error: 'Ya existe una nómina para ese colegio y programa.',
        rosterId: (existing as unknown as { id?: string } | null)?.id ?? null,
      });
    }
    return res.status(500).json({ error: 'Error al crear la nómina' });
  } catch (error) {
    logIntakeFailure('admin unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
