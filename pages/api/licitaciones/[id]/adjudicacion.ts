/**
 * Adjudicacion Data API
 * POST /api/licitaciones/[id]/adjudicacion
 *
 * Saves adjudicacion details: winner ATE, amount, payment terms, contact.
 * Does NOT advance state — that's handled by adjudicacion-confirmar.ts
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';
import { AdjudicacionSchema } from '@/types/licitaciones';

// The award values the Carta de adjudicación prints (lib/cartaGenerator.ts):
// when one of them changes, a Carta generated earlier no longer matches.
const CARTA_TEXT_FIELDS = [
  'condiciones_pago',
  'fecha_oferta_ganadora',
  'contacto_coordinacion_nombre',
  'contacto_coordinacion_email',
  'contacto_coordinacion_telefono',
] as const;

const CARTA_INVALIDADA_MSG =
  'La Carta de adjudicación ya no corresponde a los datos guardados. Genérela de nuevo antes de confirmar.';

const CARTA_CONFLICTO_MSG =
  'Otra persona generó o cambió la Carta mientras guardaba. Recargue la página y revise los datos antes de continuar.';

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

function sameText(stored: unknown, incoming: unknown): boolean {
  if (isEmpty(stored) && isEmpty(incoming)) return true;
  return String(stored ?? '') === String(incoming ?? '');
}

// Postgres numeric may arrive as text («1200.50»): compare as numbers.
function sameAmount(stored: unknown, incoming: unknown): boolean {
  if (isEmpty(stored) && isEmpty(incoming)) return true;
  if (isEmpty(stored) || isEmpty(incoming)) return false;
  return Number(stored) === Number(incoming);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-adjudicacion');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  const licitacionId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');
    const isEncargado = roleTypes.includes('encargado_licitacion');

    if (!isAdmin && !isEncargado) {
      return sendAuthError(res, 'No tiene permisos para guardar adjudicacion', 403);
    }

    // Fetch licitacion
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado, carta_adjudicacion_url, ganador_ate_id, monto_adjudicado_uf, condiciones_pago, fecha_oferta_ganadora, contacto_coordinacion_nombre, contacto_coordinacion_email, contacto_coordinacion_telefono')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    if (licitacion.estado !== 'adjudicacion_pendiente') {
      return sendAuthError(
        res,
        `Los datos de adjudicacion solo pueden guardarse en estado "adjudicacion_pendiente". Estado actual: "${licitacion.estado}".`,
        422
      );
    }

    // School scoping for encargado
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // Validate input
    const parseResult = AdjudicacionSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const data = parseResult.data;

    // Verify the ganador ATE belongs to this licitacion
    const { data: ateCheck } = await serviceClient
      .from('licitacion_ates')
      .select('id')
      .eq('id', data.ganador_ate_id)
      .eq('licitacion_id', licitacionId)
      .single();

    if (!ateCheck) {
      return sendAuthError(res, 'El ATE ganador no pertenece a esta licitacion', 400);
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      ganador_ate_id: data.ganador_ate_id,
    };
    if (data.monto_adjudicado_uf !== undefined) updatePayload.monto_adjudicado_uf = data.monto_adjudicado_uf;
    if (data.condiciones_pago !== undefined) updatePayload.condiciones_pago = data.condiciones_pago;
    if (data.fecha_oferta_ganadora !== undefined) updatePayload.fecha_oferta_ganadora = data.fecha_oferta_ganadora;
    if (data.contacto_coordinacion_nombre !== undefined) updatePayload.contacto_coordinacion_nombre = data.contacto_coordinacion_nombre;
    if (data.contacto_coordinacion_email !== undefined) updatePayload.contacto_coordinacion_email = data.contacto_coordinacion_email;
    if (data.contacto_coordinacion_telefono !== undefined) updatePayload.contacto_coordinacion_telefono = data.contacto_coordinacion_telefono;

    // A Carta generated for other values stops counting: the tender's pointer
    // to it is emptied (the document row stays as history). Only a CHANGE of a
    // printed value clears it — a cleared value is a change — so the save
    // «Generar Carta» makes just before generating keeps the Carta.
    const changedFields: string[] = [];
    if (updatePayload.ganador_ate_id !== licitacion.ganador_ate_id) changedFields.push('ganador_ate_id');
    if ('monto_adjudicado_uf' in updatePayload &&
        !sameAmount(licitacion.monto_adjudicado_uf, updatePayload.monto_adjudicado_uf)) {
      changedFields.push('monto_adjudicado_uf');
    }
    for (const field of CARTA_TEXT_FIELDS) {
      if (field in updatePayload && !sameText(licitacion[field], updatePayload[field])) changedFields.push(field);
    }
    const cartaLeida = licitacion.carta_adjudicacion_url as string | null;
    const cartaInvalidada = !!cartaLeida && changedFields.length > 0;

    let updated: Record<string, unknown>;
    if (cartaInvalidada) {
      // The award data and the emptied pointer are ONE update, guarded by the
      // pointer read above: if another Carta was generated (or the pointer
      // changed) meanwhile, no row matches and nothing is saved.
      const { data: guarded, error: guardedError } = await serviceClient
        .from('licitaciones')
        .update({ ...updatePayload, carta_adjudicacion_url: null })
        .eq('id', licitacionId)
        .eq('carta_adjudicacion_url', cartaLeida)
        .select('*')
        .maybeSingle();
      if (guardedError) {
        return sendAuthError(res, 'Error al guardar adjudicacion', 500, guardedError.message);
      }
      if (!guarded) {
        return sendAuthError(res, CARTA_CONFLICTO_MSG, 409);
      }
      updated = guarded;
    } else {
      const { data: plain, error: updateError } = await serviceClient
        .from('licitaciones')
        .update(updatePayload)
        .eq('id', licitacionId)
        .select('*')
        .single();

      if (updateError || !plain) {
        return sendAuthError(res, `Error al guardar adjudicacion: ${updateError?.message || 'Error desconocido'}`, 500);
      }
      updated = plain;
    }

    // Update es_ganador on all ATEs (reset then set winner). The winner is
    // the one stored NOW, re-read after the writes above: when two saves
    // interleave, the later one leaves the flags of the winner that stands.
    const { data: storedWinner } = await serviceClient
      .from('licitaciones')
      .select('ganador_ate_id')
      .eq('id', licitacionId)
      .single();
    const flagWinnerId = (storedWinner?.ganador_ate_id as string | null | undefined) ?? data.ganador_ate_id;

    await serviceClient
      .from('licitacion_ates')
      .update({ es_ganador: false })
      .eq('licitacion_id', licitacionId);

    await serviceClient
      .from('licitacion_ates')
      .update({ es_ganador: true })
      .eq('id', flagWinnerId);

    // Historial
    await serviceClient.from('licitacion_historial').insert({
      licitacion_id: licitacionId,
      accion: 'Datos de adjudicacion guardados',
      estado_anterior: licitacion.estado,
      estado_nuevo: licitacion.estado,
      detalles: { ganador_ate_id: data.ganador_ate_id },
      user_id: user.id,
    });

    if (cartaInvalidada) {
      // No transaction is available here: if this line fails, the invalidation
      // stands, the failure is logged and the answer says no line was written.
      const { error: histError } = await serviceClient.from('licitacion_historial').insert({
        licitacion_id: licitacionId,
        accion: 'Carta de Adjudicacion anulada por cambio de datos',
        estado_anterior: licitacion.estado,
        estado_nuevo: licitacion.estado,
        detalles: { carta_anterior: licitacion.carta_adjudicacion_url, campos_cambiados: changedFields },
        user_id: user.id,
      });
      if (histError) {
        console.error('[licitaciones-adjudicacion] licitacion_historial insert failed (Carta invalidada):', histError.message);
      }
      return sendApiResponse(
        res,
        { licitacion: updated, carta_invalidada: true, historial_registrado: !histError },
        200,
        CARTA_INVALIDADA_MSG
      );
    }

    return sendApiResponse(res, { licitacion: updated, carta_invalidada: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al guardar adjudicacion', 500, message);
  }
}
