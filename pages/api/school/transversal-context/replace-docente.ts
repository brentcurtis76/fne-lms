import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission, hasContextWriteRole } from '@/lib/permissions/directivo';
import { Validators } from '@/lib/types/api-auth.types';

/**
 * POST /api/school/transversal-context/replace-docente
 *
 * PR 2 item 2 — safe docente replacement; GC-20 — the change also once a
 * registro started or was sent. The whole decision and every write live in
 * the `change_course_docente` Postgres function
 * (20261120112000_change_course_docente.sql), called with the CALLER's
 * client so its own authorisation (assessment admin or directivo of the
 * course's school) runs as the caller. This route only authenticates,
 * applies the shared directivo gate plus the admin/equipo_directivo write
 * restriction, validates the two UUIDs and the optional reason, and maps the
 * function's refusals to HTTP. A started registro is closed only with a
 * reason: without one the function answers `reason_required` and the page
 * asks for it. Nothing is written here and no docente identity reaches the
 * logs.
 */

type ReplacementCode =
  | 'docente_replaced'
  | 'reason_required'
  | 'reason_invalid'
  | 'context_missing'
  | 'no_active_assignment'
  | 'assignment_invariant_violation'
  | 'same_docente'
  | 'docente_not_eligible_for_school'
  | 'course_not_found'
  | 'replacement_forbidden'
  | 'replacement_failed';

const REFUSAL_STATUS: Record<Exclude<ReplacementCode, 'docente_replaced'>, 403 | 404 | 409 | 422 | 500> = {
  reason_required: 409,
  reason_invalid: 422,
  context_missing: 422,
  no_active_assignment: 409,
  assignment_invariant_violation: 409,
  same_docente: 409,
  docente_not_eligible_for_school: 422,
  course_not_found: 404,
  replacement_forbidden: 403,
  replacement_failed: 500,
};

const REFUSAL_MESSAGE: Record<Exclude<ReplacementCode, 'docente_replaced'>, string> = {
  // Base sentence; reasonRequiredMessage() puts the counts in.
  reason_required:
    'El registro de este curso ya comenzó: los registros iniciados se cerrarán y quedarán como historial ' +
    '(el docente anterior podrá verlos en «Archivados») y el nuevo docente empezará uno en blanco. ' +
    'Las respuestas nunca se transfieren. Escriba el motivo del cambio para continuar.',
  reason_invalid:
    'El motivo es obligatorio y puede tener hasta 500 caracteres.',
  context_missing:
    'La escuela no tiene un año de implementación válido en su contexto transversal; corríjalo antes de cambiar el docente.',
  no_active_assignment:
    'Este curso no tiene un docente activo asignado; use "Asignar" en lugar de cambiar el docente.',
  assignment_invariant_violation:
    'Este curso registra más de una asignación activa de docente, lo que no es válido. ' +
    'Se requiere una resolución administrativa controlada antes de poder cambiar el docente de este curso.',
  same_docente:
    'La persona seleccionada ya es el docente activo de este curso.',
  docente_not_eligible_for_school:
    'La persona seleccionada no está habilitada como docente activo en esta escuela.',
  course_not_found:
    'Curso no encontrado.',
  replacement_forbidden:
    'No tiene permiso para cambiar el docente de este curso.',
  replacement_failed:
    'No se pudo completar el cambio de docente. Intente nuevamente más tarde.',
};

export interface ReasonRequiredCounts {
  closing: number;
  kept: number;
}

/** Longest reason the function accepts (the history table's CHECK). */
const MAX_REASON_LENGTH = 500;

const NOTHING_REPLACED = { previousDocenteId: null, newDocenteId: null, instancesReattached: 0 };

interface RpcError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/**
 * Reads the counts the function reports on `reason_required` from its JSON
 * DETAIL `{"closing": n, "kept": m}`; anything missing or malformed reads 0.
 */
export function parseReasonRequiredCounts(error: RpcError): ReasonRequiredCounts {
  const counts: ReasonRequiredCounts = { closing: 0, kept: 0 };
  if (!error.details) return counts;
  try {
    const parsed = JSON.parse(error.details);
    if (Number.isInteger(parsed?.closing) && parsed.closing >= 0) counts.closing = parsed.closing;
    if (Number.isInteger(parsed?.kept) && parsed.kept >= 0) counts.kept = parsed.kept;
  } catch {
    // malformed DETAIL: zeros
  }
  return counts;
}

function reasonRequiredMessage(counts: ReasonRequiredCounts): string {
  let message =
    `El registro de este curso ya comenzó: ${counts.closing} registro(s) iniciado(s) se cerrarán y quedarán como historial ` +
    '(el docente anterior podrá verlos en «Archivados») y el nuevo docente empezará uno en blanco. ' +
    'Las respuestas nunca se transfieren. Escriba el motivo del cambio para continuar.';
  if (counts.kept > 0) {
    message += ` ${counts.kept} registro(s) ya enviado(s) se mantienen como resultado del curso.`;
  }
  return message;
}

/** The stable code is the message up to the first ':'. */
function rpcMessageCode(error: RpcError): string {
  return (error.message ?? '').split(':')[0].trim();
}

const P0001_CODES: ReadonlySet<string> = new Set([
  'reason_invalid',
  'context_missing',
  'no_active_assignment',
  'assignment_invariant_violation',
  'same_docente',
  'docente_not_eligible_for_school',
  'course_not_found',
]);

/** Maps a `change_course_docente` error to the HTTP refusal. */
export function mapRpcError(error: RpcError): {
  code: Exclude<ReplacementCode, 'docente_replaced'>;
  counts?: ReasonRequiredCounts;
} {
  if (error.code === '42501') return { code: 'replacement_forbidden' };
  if (error.code === 'P0001') {
    const messageCode = rpcMessageCode(error);
    if (messageCode === 'reason_required') {
      return { code: 'reason_required', counts: parseReasonRequiredCounts(error) };
    }
    if (P0001_CODES.has(messageCode)) {
      return { code: messageCode as Exclude<ReplacementCode, 'docente_replaced'> };
    }
  }
  return { code: 'replacement_failed' };
}

function refuse(
  res: NextApiResponse,
  code: Exclude<ReplacementCode, 'docente_replaced'>,
  extra: Record<string, unknown> = {},
  messageOverride?: string
) {
  const message = messageOverride ?? REFUSAL_MESSAGE[code];
  // Code only: no identities and no database details reach the log line.
  console.warn('[replace-docente] refused:', code);
  return res.status(REFUSAL_STATUS[code]).json({
    success: false,
    code,
    error: message,
    message,
    replacement: NOTHING_REPLACED,
    ...extra,
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);
  const serviceClient = createServiceRoleClient();

  const { hasPermission, isAdmin } = await hasDirectivoPermission(serviceClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden cambiar docentes',
    });
  }

  // hasDirectivoPermission admits assigned consultores (read surface). Only
  // admin and equipo_directivo may replace a docente.
  if (!isAdmin && !(await hasContextWriteRole(supabaseClient, user.id))) {
    return res.status(403).json({
      code: 'replacement_write_forbidden',
      error: 'Solo el equipo directivo y los administradores pueden cambiar el docente de un curso',
    });
  }

  const { course_structure_id, docente_id, reason } = (req.body ?? {}) as Record<string, unknown>;
  if (
    typeof course_structure_id !== 'string' || !Validators.isUUID(course_structure_id) ||
    typeof docente_id !== 'string' || !Validators.isUUID(docente_id)
  ) {
    return res.status(400).json({
      code: 'invalid_request',
      error: 'Se requiere course_structure_id y docente_id válidos',
    });
  }
  // The reason is optional (asked only when a started registro will be
  // closed); when present it is a string of at most 500 characters. Blank
  // reasons are judged by the function (reason_invalid).
  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > MAX_REASON_LENGTH)) {
    return res.status(400).json({
      code: 'invalid_request',
      error: 'El motivo debe ser un texto de hasta 500 caracteres',
    });
  }

  try {
    // The USER client: the function's own authorisation runs as the caller.
    const { data, error } = await supabaseClient.rpc('change_course_docente', {
      p_course_structure_id: course_structure_id,
      p_new_docente_id: docente_id,
      p_reason: typeof reason === 'string' ? reason : null,
    });

    if (error) {
      const mapped = mapRpcError(error as RpcError);
      if (mapped.code === 'replacement_failed') {
        console.error('[replace-docente] rpc failed:', { pgCode: (error as RpcError).code ?? null });
      }
      if (mapped.code === 'reason_required' && mapped.counts) {
        return refuse(res, mapped.code, { counts: mapped.counts }, reasonRequiredMessage(mapped.counts));
      }
      return refuse(res, mapped.code, mapped.counts ? { counts: mapped.counts } : {});
    }

    const result = (data ?? {}) as Record<string, unknown>;
    const count = (key: string) => (Number.isInteger(result[key]) ? (result[key] as number) : 0);
    const instancesReattached = count('moved');
    const closed = count('closed');
    const created = count('created');
    const kept = count('kept');
    const message = closed === 0 && kept === 0
      ? `Docente cambiado correctamente. ${instancesReattached} registro(s) pendiente(s) ` +
        'reasignado(s) al nuevo docente; ninguna respuesta fue transferida.'
      : `Docente cambiado correctamente. ${instancesReattached} registro(s) pendiente(s) reasignado(s) al nuevo docente; ` +
        `${closed} registro(s) iniciado(s) cerrado(s) y guardado(s) como historial, con ${created} registro(s) en blanco ` +
        `para el nuevo docente; ${kept} registro(s) enviado(s) se mantienen como resultado del curso. ` +
        'Ninguna respuesta fue transferida.';

    return res.status(200).json({
      success: true,
      code: 'docente_replaced',
      message,
      replacement: {
        previousDocenteId: (result.previous_docente_id as string | undefined) ?? null,
        newDocenteId: (result.new_docente_id as string | undefined) ?? docente_id,
        instancesReattached,
      },
    });
  } catch (err: unknown) {
    console.error('[replace-docente] unexpected error:', err instanceof Error ? err.name : 'unknown');
    return refuse(res, 'replacement_failed');
  }
}
