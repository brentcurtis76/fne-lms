import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission, hasContextWriteRole } from '@/lib/permissions/directivo';
import { Validators } from '@/lib/types/api-auth.types';

/**
 * POST /api/school/transversal-context/replace-docente
 *
 * PR 2 item 2 — safe docente replacement. The whole decision and the four
 * writes live in the `replace_course_docente` Postgres function
 * (20260907130000_replace_course_docente.sql), called with the CALLER's
 * client so its own authorisation (assessment admin or directivo of the
 * course's school) runs as the caller. This route only authenticates,
 * applies the shared directivo gate plus the admin/equipo_directivo write
 * restriction, validates the two UUIDs and maps the function's refusals to
 * HTTP. Nothing is written here and no docente identity reaches the logs.
 */

type ReplacementCode =
  | 'docente_replaced'
  | 'evaluation_started'
  | 'no_active_assignment'
  | 'assignment_invariant_violation'
  | 'same_docente'
  | 'docente_not_eligible_for_school'
  | 'course_not_found'
  | 'replacement_forbidden'
  | 'replacement_failed';

const REFUSAL_STATUS: Record<Exclude<ReplacementCode, 'docente_replaced'>, 403 | 404 | 409 | 422 | 500> = {
  evaluation_started: 409,
  no_active_assignment: 409,
  assignment_invariant_violation: 409,
  same_docente: 409,
  docente_not_eligible_for_school: 422,
  course_not_found: 404,
  replacement_forbidden: 403,
  replacement_failed: 500,
};

const REFUSAL_MESSAGE: Record<Exclude<ReplacementCode, 'docente_replaced'>, string> = {
  evaluation_started:
    'La evaluación de este curso ya comenzó o registra respuestas, por lo que no es posible cambiar el docente desde aquí. ' +
    'Se requiere una resolución administrativa; las respuestas del docente anterior nunca se transfieren.',
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

export interface EvaluationStartedCounts {
  instancesStarted: number;
  instancesWithResponses: number;
}

const NOTHING_REPLACED = { previousDocenteId: null, newDocenteId: null, instancesReattached: 0 };

interface RpcError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/**
 * Reads the counts the function reports on `evaluation_started`, preferring
 * the JSON DETAIL and falling back to the message's `key=value` pairs.
 */
export function parseEvaluationStartedCounts(error: RpcError): EvaluationStartedCounts {
  const counts: EvaluationStartedCounts = { instancesStarted: 0, instancesWithResponses: 0 };
  if (error.details) {
    try {
      const parsed = JSON.parse(error.details);
      if (Number.isInteger(parsed?.instances_started)) counts.instancesStarted = parsed.instances_started;
      if (Number.isInteger(parsed?.instances_with_responses)) counts.instancesWithResponses = parsed.instances_with_responses;
      return counts;
    } catch {
      // fall through to the message
    }
  }
  const message = error.message ?? '';
  const started = /instances_started=(\d+)/.exec(message);
  const withResponses = /instances_with_responses=(\d+)/.exec(message);
  if (started) counts.instancesStarted = Number(started[1]);
  if (withResponses) counts.instancesWithResponses = Number(withResponses[1]);
  return counts;
}

/** The stable code is the message up to the first ':' (counts follow it on evaluation_started). */
function rpcMessageCode(error: RpcError): string {
  return (error.message ?? '').split(':')[0].trim();
}

const P0001_CODES: ReadonlySet<string> = new Set([
  'evaluation_started',
  'no_active_assignment',
  'assignment_invariant_violation',
  'same_docente',
  'docente_not_eligible_for_school',
  'course_not_found',
]);

/** Maps a `replace_course_docente` error to the HTTP refusal. */
export function mapRpcError(error: RpcError): {
  code: Exclude<ReplacementCode, 'docente_replaced'>;
  counts?: EvaluationStartedCounts;
} {
  if (error.code === '42501') return { code: 'replacement_forbidden' };
  if (error.code === 'P0001') {
    const messageCode = rpcMessageCode(error);
    if (messageCode === 'evaluation_started') {
      return { code: 'evaluation_started', counts: parseEvaluationStartedCounts(error) };
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
  extra: Record<string, unknown> = {}
) {
  const message = REFUSAL_MESSAGE[code];
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

  const { course_structure_id, docente_id } = (req.body ?? {}) as Record<string, unknown>;
  if (
    typeof course_structure_id !== 'string' || !Validators.isUUID(course_structure_id) ||
    typeof docente_id !== 'string' || !Validators.isUUID(docente_id)
  ) {
    return res.status(400).json({
      code: 'invalid_request',
      error: 'Se requiere course_structure_id y docente_id válidos',
    });
  }

  try {
    // The USER client: the function's own authorisation runs as the caller.
    const { data, error } = await supabaseClient.rpc('replace_course_docente', {
      p_course_structure_id: course_structure_id,
      p_new_docente_id: docente_id,
    });

    if (error) {
      const mapped = mapRpcError(error as RpcError);
      if (mapped.code === 'replacement_failed') {
        console.error('[replace-docente] rpc failed:', { pgCode: (error as RpcError).code ?? null });
      }
      return refuse(res, mapped.code, mapped.counts ? { counts: mapped.counts } : {});
    }

    const result = (data ?? {}) as Record<string, unknown>;
    const instancesReattached = Number.isInteger(result.instances_reattached)
      ? (result.instances_reattached as number)
      : 0;
    const message =
      `Docente cambiado correctamente. ${instancesReattached} evaluación(es) pendiente(s) ` +
      'reasignada(s) al nuevo docente; ninguna respuesta fue transferida.';

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
