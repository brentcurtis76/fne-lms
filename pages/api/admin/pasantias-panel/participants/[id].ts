/**
 * GET / PATCH / PUT /api/admin/pasantias-panel/participants/[id]
 *
 * Global admins only (forced-password hold first).
 *
 * GET   one traveller: school data, roster, tracking, documents, activity.
 * PATCH FNE's tracking, a full replace of its six values with
 *       `expectedVersion` (null = nothing saved yet). Stale → 409 + current row.
 * PUT   an admin corrects the data the SCHOOL entered. Same field rules as the
 *       school's own form; `expectedVersion` is the participant's version.
 *       Stale → 409 + current row; a RUT already in that roster → 409.
 *
 * Every successful write answers the row as stored, re-read after the write.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeIntakeAdmin } from '../../../../../lib/pasantias/participants/admin';
import { isUnavailable, logIntakeFailure } from '../../../../../lib/pasantias/participants/server';
import { MESSAGES, isUuid } from '../../../../../lib/pasantias/participants/validation';
import {
  CORRECTION_REFUSAL_FIELDS,
  callSaveLogistics,
  callSaveParticipant,
  listActivity,
  listDocuments,
  loadParticipant,
} from '../../../../../lib/pasantias/panel/server';
import { validateCorrectionBody, validateLogisticsBody } from '../../../../../lib/pasantias/panel/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos a esa persona.' };
const STALE = 'Estos datos cambiaron mientras los editabas. Te mostramos la versión guardada.';
const VALIDATION = 'Revisa los campos marcados.';

/** Answers the freshly stored row, or 500 if it cannot be re-read. */
async function sendCurrent(
  res: NextApiResponse,
  supabase: SupabaseClient,
  participantId: string,
  status: number,
  extra: Record<string, unknown> = {}
) {
  const current = await loadParticipant(supabase, participantId);
  // Explicit `=== false`: tsconfig has strict off (see the intake routes).
  if (current.ok === false) {
    logIntakeFailure('panel participant re-read failed', current.error);
    return res.status(500).json({ error: 'El cambio se guardó, pero no pudimos recargar los datos. Actualiza el panel.' });
  }
  if (!current.value) return res.status(404).json(NOT_FOUND);
  return res.status(status).json({ ...extra, row: current.value.row, roster: current.value.roster });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['GET', 'PATCH', 'PUT']);
  if (!auth) return;
  const { supabase, userId } = auth;

  const participantId = typeof req.query.id === 'string' ? req.query.id.toLowerCase() : '';
  if (!isUuid(participantId)) return res.status(404).json(NOT_FOUND);

  try {
    const found = await loadParticipant(supabase, participantId);
    if (found.ok === false) {
      logIntakeFailure('panel participant read failed', found.error);
      return res.status(500).json({ error: 'Error al cargar los datos' });
    }
    if (!found.value) return res.status(404).json(NOT_FOUND);
    const { row, roster } = found.value;

    if (req.method === 'GET') {
      const [documents, activity] = await Promise.all([
        listDocuments(supabase, participantId),
        listActivity(supabase, participantId, roster.program),
      ]);
      if (documents.ok === false || activity.ok === false) {
        logIntakeFailure(
          'panel participant detail failed',
          documents.ok === false ? documents.error : (activity as { error: unknown }).error
        );
        return res.status(500).json({ error: 'Error al cargar los datos' });
      }
      return res.status(200).json({ row, roster, documents: documents.value, activity: activity.value });
    }

    if (req.method === 'PATCH') {
      const validation = validateLogisticsBody(req.body);
      if (validation.ok === false) {
        return res.status(422).json({ code: 'VALIDATION', error: VALIDATION, fields: validation.errors });
      }
      const outcome = await callSaveLogistics(supabase, participantId, validation.value, userId);
      if (outcome.ok === true) return sendCurrent(res, supabase, participantId, 200);
      if (outcome.refusal === 'stale_version') {
        return sendCurrent(res, supabase, participantId, 409, { code: 'STALE', error: STALE });
      }
      if (outcome.refusal === 'unknown_participant') return res.status(404).json(NOT_FOUND);
      if (outcome.refusal) {
        console.error('[pasantias-intake] panel tracking refused by the database:', { code: outcome.refusal });
        return res.status(422).json({ code: 'VALIDATION', error: VALIDATION });
      }
      logIntakeFailure('panel tracking save failed', outcome.error);
      return res
        .status(isUnavailable(outcome.error) ? 503 : 500)
        .json({ error: 'No pudimos guardar el seguimiento. Inténtalo de nuevo.' });
    }

    // PUT — correction of the school's data. The program comes from the stored roster.
    const validation = validateCorrectionBody(req.body, roster.program);
    if (validation.ok === false) {
      return res.status(422).json({ code: 'VALIDATION', error: VALIDATION, fields: validation.errors });
    }
    const { expectedVersion, fields } = validation.value;
    const outcome = await callSaveParticipant(supabase, participantId, expectedVersion, fields, userId);
    if (outcome.ok === true) return sendCurrent(res, supabase, participantId, 200);
    if (outcome.refusal === 'stale_version') {
      return sendCurrent(res, supabase, participantId, 409, { code: 'STALE', error: STALE });
    }
    if (outcome.refusal === 'duplicate_rut') {
      return res
        .status(409)
        .json({ code: 'DUPLICATE_RUT', error: MESSAGES.rutDuplicate, fields: { rut: MESSAGES.rutDuplicate } });
    }
    if (outcome.refusal === 'unknown_participant') return res.status(404).json(NOT_FOUND);
    const field = outcome.refusal ? CORRECTION_REFUSAL_FIELDS[outcome.refusal] : undefined;
    if (field) {
      // The code names a field, never a value, so it is safe to log.
      console.error('[pasantias-intake] panel correction refused by the database:', { code: outcome.refusal });
      return res.status(422).json({ code: 'VALIDATION', error: VALIDATION, fields: { [field]: VALIDATION } });
    }
    if (outcome.refusal) {
      console.error('[pasantias-intake] panel correction refused (caller bug):', { code: outcome.refusal });
      return res.status(500).json({ error: 'No pudimos guardar los datos. Inténtalo de nuevo.' });
    }
    logIntakeFailure('panel correction failed', outcome.error);
    return res
      .status(isUnavailable(outcome.error) ? 503 : 500)
      .json({ error: 'No pudimos guardar los datos. Inténtalo de nuevo.' });
  } catch (error) {
    logIntakeFailure('panel unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
