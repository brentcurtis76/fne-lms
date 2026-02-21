/**
 * Licitacion Service Layer
 * All business logic for the licitaciones procurement module.
 * Every exported function accepts a SupabaseClient as first parameter.
 * Do NOT call getSupabaseClient() here — pass the client from the API route.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { calculateLicitacionTimeline } from '@/lib/businessDays';
import {
  Licitacion,
  LicitacionDetail,
  CreateLicitacionInput,
  PublicacionInput,
  TimelineDates,
  LicitacionEstado,
} from '@/types/licitaciones';

// ============================================================
// HELPERS
// ============================================================

/**
 * Format a JS Date as YYYY-MM-DD string for DB storage.
 */
function dateToString(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ============================================================
// getNextLicitacionNumber
// ============================================================

/**
 * Generates the next sequential numero_licitacion for a school+year.
 * Format: LIC-{YEAR}-{SCHOOL_CODE}-{SEQ} (SEQ zero-padded to 3 digits)
 * Example: LIC-2026-COL001-001
 */
export async function getNextLicitacionNumber(
  supabase: SupabaseClient,
  schoolCode: string,
  year: number
): Promise<string> {
  const prefix = `LIC-${year}-${schoolCode}-`;

  const { data, error } = await supabase
    .from('licitaciones')
    .select('numero_licitacion')
    .like('numero_licitacion', `${prefix}%`)
    .order('numero_licitacion', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Error al obtener numero de licitacion: ${error.message}`);
  }

  let nextSeq = 1;
  if (data && data.length > 0) {
    const last = data[0].numero_licitacion as string;
    const parts = last.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  const seqStr = String(nextSeq).padStart(3, '0');
  return `${prefix}${seqStr}`;
}

// ============================================================
// calculateTimeline
// ============================================================

/**
 * Calculates all licitacion timeline dates from a publication date.
 * Fetches holidays directly with the provided Supabase client.
 * Does NOT write to the database.
 */
export async function calculateTimeline(
  supabase: SupabaseClient,
  fechaPublicacion: string
): Promise<TimelineDates> {
  const pubDate = new Date(fechaPublicacion + 'T00:00:00');
  const year = pubDate.getFullYear();

  const { data: holidays, error } = await supabase
    .from('feriados_chile')
    .select('fecha')
    .gte('year', year)
    .lte('year', year + 1);

  if (error) {
    throw new Error(`Error al obtener feriados: ${error.message}`);
  }

  const holidayDates = (holidays || []).map(
    (h: { fecha: string }) => new Date(h.fecha + 'T00:00:00')
  );

  const result = calculateLicitacionTimeline(pubDate, holidayDates);

  return {
    fecha_limite_solicitud_bases: dateToString(result.fecha_limite_solicitud_bases),
    fecha_limite_consultas: dateToString(result.fecha_limite_consultas),
    fecha_inicio_propuestas: dateToString(result.fecha_inicio_propuestas),
    fecha_limite_propuestas: dateToString(result.fecha_limite_propuestas),
    fecha_limite_evaluacion: dateToString(result.fecha_limite_evaluacion),
  };
}

// ============================================================
// generatePublicacionText
// ============================================================

/**
 * Generates the publicacion text for the school to post on social media.
 * Variables: school_name, school_comuna, fecha_limite_bases, email_licitacion
 */
export function generatePublicacionText(
  licitacion: Licitacion,
  schoolName: string,
  comuna: string
): string {
  const fechaLimite = licitacion.fecha_limite_solicitud_bases
    ? formatDate(licitacion.fecha_limite_solicitud_bases)
    : '[fecha pendiente]';

  return (
    `Con el objetivo de asesorar al equipo directivo y lideres del establecimiento ` +
    `en el cambio de cultura organizacional centrada en la innovacion educativa y ` +
    `en el Modelo Relacional es que el ${schoolName}, de la comuna de ${comuna}, ` +
    `llamamos a concurso publico para la contratacion de servicios ATE con el ` +
    `siguiente requerimiento: asesoria al equipo directivo para liderar a la escuela ` +
    `hacia una cultura colaborativa, de aprendizaje profundo, con metodologias de ` +
    `vanguardia y con la base en un enfoque en lo relacional.\n\n` +
    `Bases de la licitacion se pueden solicitar hasta el ${fechaLimite} al ` +
    `correo ${licitacion.email_licitacion}`
  );
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const day = parseInt(parts[2], 10);
  const month = months[parseInt(parts[1], 10) - 1] || '';
  const year = parts[0];
  return `${day} de ${month} de ${year}`;
}

// ============================================================
// createLicitacion
// ============================================================

/**
 * Creates a new licitacion.
 * Admin-only: must be called with service role client from API route.
 * Validates fields, generates numero_licitacion, inserts record, creates historial entry.
 */
export async function createLicitacion(
  supabase: SupabaseClient,
  data: CreateLicitacionInput,
  userId: string
): Promise<Licitacion> {
  // 1. Validate school exists
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('id, name, code, cliente_id')
    .eq('id', data.school_id)
    .single();

  if (schoolError || !school) {
    throw new Error('Escuela no encontrada');
  }

  // 2. Validate school has a linked cliente
  if (!school.cliente_id) {
    throw new Error('La escuela no tiene un cliente asociado. Vincule un cliente antes de crear una licitacion.');
  }

  // 3. Validate cliente exists and has required legal fields
  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, nombre_legal, nombre_fantasia, rut, nombre_representante, rut_representante, fecha_escritura, nombre_notario')
    .eq('id', school.cliente_id)
    .single();

  if (clienteError || !cliente) {
    throw new Error('Cliente vinculado no encontrado');
  }

  if (!cliente.nombre_representante || !cliente.rut_representante || !cliente.fecha_escritura || !cliente.nombre_notario) {
    throw new Error('El cliente no tiene toda la informacion legal requerida (representante, RUT, escritura, notario)');
  }

  // 4. Validate programa exists
  const { data: programa, error: programaError } = await supabase
    .from('programas')
    .select('id, nombre')
    .eq('id', data.programa_id)
    .single();

  if (programaError || !programa) {
    throw new Error('Programa no encontrado');
  }

  // 5. peso check (should be enforced by Zod too but double-check)
  const pesoEconomica = 100 - data.peso_evaluacion_tecnica;
  if (data.peso_evaluacion_tecnica + pesoEconomica !== 100) {
    throw new Error('Los pesos de evaluacion tecnica y economica deben sumar 100');
  }

  // 6. Generate numero_licitacion with race-condition retry
  const schoolCode = school.code || String(data.school_id);
  let numeroLicitacion: string;
  let insertError: Error | null = null;
  let attempt = 0;
  const MAX_ATTEMPTS = 3;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      numeroLicitacion = await getNextLicitacionNumber(supabase, schoolCode, data.year);

      const insertData = {
        numero_licitacion: numeroLicitacion,
        school_id: data.school_id,
        cliente_id: school.cliente_id,
        programa_id: data.programa_id,
        nombre_licitacion: data.nombre_licitacion,
        year: data.year,
        estado: 'publicacion_pendiente' as const,
        email_licitacion: data.email_licitacion,
        monto_minimo: data.monto_minimo,
        monto_maximo: data.monto_maximo,
        tipo_moneda: data.tipo_moneda,
        duracion_minima: data.duracion_minima,
        duracion_maxima: data.duracion_maxima,
        peso_evaluacion_tecnica: data.peso_evaluacion_tecnica,
        peso_evaluacion_economica: pesoEconomica,
        participantes_estimados: data.participantes_estimados ?? null,
        modalidad_preferida: data.modalidad_preferida ?? null,
        notas: data.notas ?? null,
        created_by: userId,
      };

      const { data: created, error: dbError } = await supabase
        .from('licitaciones')
        .insert(insertData)
        .select('*')
        .single();

      if (dbError) {
        // Check for unique constraint violation
        if (dbError.code === '23505') {
          if (dbError.message.includes('school_programa_year')) {
            throw new Error('Ya existe una licitacion activa para esta escuela, programa y ano.');
          }
          // numero_licitacion race condition — retry
          insertError = new Error(dbError.message);
          continue;
        }
        throw new Error(`Error al crear licitacion: ${dbError.message}`);
      }

      // 7. Create historial entry
      await supabase.from('licitacion_historial').insert({
        licitacion_id: created.id,
        accion: 'Licitacion creada',
        estado_anterior: null,
        estado_nuevo: 'publicacion_pendiente',
        detalles: { numero_licitacion: created.numero_licitacion },
        user_id: userId,
      });

      return created as Licitacion;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Ya existe una licitacion activa')) {
        throw err;
      }
      insertError = err instanceof Error ? err : new Error('Error desconocido');
      if (attempt >= MAX_ATTEMPTS) break;
    }
  }

  throw insertError || new Error('Error al crear licitacion despues de varios intentos');
}

// ============================================================
// confirmPublicacion
// ============================================================

/**
 * Confirms publicacion: saves fecha_publicacion, calculates timeline dates,
 * transitions estado to 'recepcion_bases_pendiente', creates historial entry.
 */
export async function confirmPublicacion(
  supabase: SupabaseClient,
  licitacionId: string,
  data: PublicacionInput,
  userId: string
): Promise<Licitacion> {
  // 1. Fetch current licitacion
  const { data: existing, error: fetchError } = await supabase
    .from('licitaciones')
    .select('*')
    .eq('id', licitacionId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Licitacion no encontrada');
  }

  if (existing.estado !== 'publicacion_pendiente') {
    throw new Error(
      `No se puede confirmar la publicacion: el estado actual es "${existing.estado}". Se requiere "publicacion_pendiente".`
    );
  }

  // 2. Calculate timeline dates
  const timeline = await calculateTimeline(supabase, data.fecha_publicacion);

  // 3. Build update payload
  const updatePayload: Record<string, unknown> = {
    fecha_publicacion: data.fecha_publicacion,
    fecha_limite_solicitud_bases: timeline.fecha_limite_solicitud_bases,
    fecha_limite_consultas: timeline.fecha_limite_consultas,
    fecha_inicio_propuestas: timeline.fecha_inicio_propuestas,
    fecha_limite_propuestas: timeline.fecha_limite_propuestas,
    fecha_limite_evaluacion: timeline.fecha_limite_evaluacion,
    estado: 'recepcion_bases_pendiente',
  };

  if (data.publicacion_imagen_url) {
    updatePayload.publicacion_imagen_url = data.publicacion_imagen_url;
  }

  // 4. Update licitacion
  const { data: updated, error: updateError } = await supabase
    .from('licitaciones')
    .update(updatePayload)
    .eq('id', licitacionId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Error al confirmar publicacion: ${updateError?.message || 'Error desconocido'}`);
  }

  // 5. Create historial entry
  await supabase.from('licitacion_historial').insert({
    licitacion_id: licitacionId,
    accion: 'Publicacion confirmada',
    estado_anterior: 'publicacion_pendiente',
    estado_nuevo: 'recepcion_bases_pendiente',
    detalles: {
      fecha_publicacion: data.fecha_publicacion,
      ...timeline,
    },
    user_id: userId,
  });

  return updated as Licitacion;
}

// ============================================================
// getLicitacionDetail
// ============================================================

/**
 * Returns full licitacion detail with joined school, cliente, and programa.
 */
export async function getLicitacionDetail(
  supabase: SupabaseClient,
  id: string
): Promise<LicitacionDetail> {
  const { data: licitacion, error } = await supabase
    .from('licitaciones')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !licitacion) {
    throw new Error('Licitacion no encontrada');
  }

  // Fetch school
  let school = null;
  if (licitacion.school_id) {
    const { data: schoolData } = await supabase
      .from('schools')
      .select('id, name, code, cliente_id')
      .eq('id', licitacion.school_id)
      .single();
    school = schoolData;
  }

  // Fetch cliente
  let cliente = null;
  if (licitacion.cliente_id) {
    const { data: clienteData } = await supabase
      .from('clientes')
      .select('id, nombre_legal, nombre_fantasia, rut, direccion, comuna, ciudad, nombre_representante, rut_representante')
      .eq('id', licitacion.cliente_id)
      .single();
    cliente = clienteData;
  }

  // Fetch programa
  let programa = null;
  if (licitacion.programa_id) {
    const { data: programaData } = await supabase
      .from('programas')
      .select('id, nombre')
      .eq('id', licitacion.programa_id)
      .single();
    programa = programaData;
  }

  return {
    ...licitacion,
    school,
    cliente,
    programa,
  } as LicitacionDetail;
}

// ============================================================
// advanceState
// ============================================================

/**
 * Valid state transitions for the licitacion lifecycle.
 * Note: adjudicacion_pendiente has two possible targets (contrato_pendiente | adjudicada_externo)
 * and is handled by confirmAdjudicacion() separately.
 */
const VALID_TRANSITIONS: Partial<Record<LicitacionEstado, LicitacionEstado>> = {
  recepcion_bases_pendiente: 'propuestas_pendientes',
  propuestas_pendientes: 'evaluacion_pendiente',
  evaluacion_pendiente: 'adjudicacion_pendiente',
};

/**
 * Advances a licitacion to the next state after validating prerequisites.
 * - recepcion_bases_pendiente -> propuestas_pendientes: requires at least 1 ATE with fecha_envio_bases set
 * - propuestas_pendientes -> evaluacion_pendiente: requires at least 1 ATE with propuesta_url set
 */
export async function advanceState(
  supabase: SupabaseClient,
  licitacionId: string,
  targetEstado: LicitacionEstado,
  userId: string
): Promise<Licitacion> {
  // 1. Fetch current licitacion
  const { data: existing, error: fetchError } = await supabase
    .from('licitaciones')
    .select('id, estado, numero_licitacion')
    .eq('id', licitacionId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Licitacion no encontrada');
  }

  const currentEstado = existing.estado as LicitacionEstado;

  // 2. Validate the transition is legal
  const expectedTarget = VALID_TRANSITIONS[currentEstado];
  if (!expectedTarget) {
    throw new Error(
      `No se puede avanzar desde el estado "${currentEstado}". No hay transicion valida definida.`
    );
  }
  if (expectedTarget !== targetEstado) {
    throw new Error(
      `Transicion invalida: desde "${currentEstado}" solo se puede avanzar a "${expectedTarget}", no a "${targetEstado}".`
    );
  }

  // 3. Check prerequisites
  if (currentEstado === 'recepcion_bases_pendiente') {
    const { count, error: countError } = await supabase
      .from('licitacion_ates')
      .select('id', { count: 'exact', head: true })
      .eq('licitacion_id', licitacionId)
      .not('fecha_envio_bases', 'is', null);

    if (countError) {
      throw new Error(`Error al verificar ATEs: ${countError.message}`);
    }
    if (!count || count === 0) {
      throw new Error(
        'Para avanzar a Recepcion de Propuestas, al menos una ATE debe tener las bases enviadas (fecha de envio registrada).'
      );
    }
  }

  if (currentEstado === 'propuestas_pendientes') {
    const { count, error: countError } = await supabase
      .from('licitacion_ates')
      .select('id', { count: 'exact', head: true })
      .eq('licitacion_id', licitacionId)
      .not('propuesta_url', 'is', null);

    if (countError) {
      throw new Error(`Error al verificar propuestas: ${countError.message}`);
    }
    if (!count || count === 0) {
      throw new Error(
        'Para avanzar a Evaluacion, al menos una ATE debe tener una propuesta subida.'
      );
    }
  }

  if (currentEstado === 'evaluacion_pendiente') {
    // Require at least one signed acta (evaluacion_firmada document)
    const { count, error: countError } = await supabase
      .from('licitacion_documentos')
      .select('id', { count: 'exact', head: true })
      .eq('licitacion_id', licitacionId)
      .eq('tipo', 'evaluacion_firmada');

    if (countError) {
      throw new Error(`Error al verificar acta firmada: ${countError.message}`);
    }
    if (!count || count === 0) {
      throw new Error(
        'Para avanzar a Adjudicacion, debe subir el Acta de Reunion firmada (tipo: evaluacion_firmada).'
      );
    }
  }

  // 4. Update estado
  const { data: updated, error: updateError } = await supabase
    .from('licitaciones')
    .update({ estado: targetEstado })
    .eq('id', licitacionId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Error al actualizar estado: ${updateError?.message || 'Error desconocido'}`);
  }

  // 5. Create historial entry
  const accionMap: Partial<Record<LicitacionEstado, string>> = {
    propuestas_pendientes: 'Avanzado a Recepcion de Propuestas',
    evaluacion_pendiente: 'Avanzado a Evaluacion Pendiente',
    adjudicacion_pendiente: 'Avanzado a Adjudicacion Pendiente',
  };

  await supabase.from('licitacion_historial').insert({
    licitacion_id: licitacionId,
    accion: accionMap[targetEstado] || `Estado cambiado a ${targetEstado}`,
    estado_anterior: currentEstado,
    estado_nuevo: targetEstado,
    detalles: {},
    user_id: userId,
  });

  return updated as Licitacion;
}

// ============================================================
// updateTimelineDates
// ============================================================

/**
 * Admin-only override of calculated timeline dates.
 * Creates historial entry logging which dates were changed.
 */
export async function updateTimelineDates(
  supabase: SupabaseClient,
  licitacionId: string,
  dates: Partial<TimelineDates>,
  userId: string
): Promise<Licitacion> {
  // Fetch existing for historial diff
  const { data: existing, error: fetchError } = await supabase
    .from('licitaciones')
    .select('id, fecha_limite_solicitud_bases, fecha_limite_consultas, fecha_inicio_propuestas, fecha_limite_propuestas, fecha_limite_evaluacion')
    .eq('id', licitacionId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Licitacion no encontrada');
  }

  const { data: updated, error: updateError } = await supabase
    .from('licitaciones')
    .update(dates)
    .eq('id', licitacionId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Error al actualizar fechas: ${updateError?.message || 'Error desconocido'}`);
  }

  // Log changed dates
  const changedDates: Record<string, { anterior: string | null; nuevo: string | null }> = {};
  for (const key of Object.keys(dates) as Array<keyof TimelineDates>) {
    const anterior = (existing as Record<string, unknown>)[key] as string | null ?? null;
    const nuevo = dates[key] ?? null;
    if (anterior !== nuevo) {
      changedDates[key] = { anterior, nuevo };
    }
  }

  await supabase.from('licitacion_historial').insert({
    licitacion_id: licitacionId,
    accion: 'Fechas de cronograma actualizadas',
    estado_anterior: updated.estado,
    estado_nuevo: updated.estado,
    detalles: { fechas_modificadas: changedDates },
    user_id: userId,
  });

  return updated as Licitacion;
}

// ============================================================
// confirmAdjudicacion
// ============================================================

/**
 * Confirms adjudicacion: transitions from adjudicacion_pendiente to either
 * - contrato_pendiente (if FNE wins, esFne = true)
 * - adjudicada_externo (if external, esFne = false)
 * Creates historial entry.
 */
export async function confirmAdjudicacion(
  supabase: SupabaseClient,
  licitacionId: string,
  esFne: boolean,
  userId: string
): Promise<Licitacion> {
  // 1. Fetch current licitacion
  const { data: existing, error: fetchError } = await supabase
    .from('licitaciones')
    .select('id, estado, ganador_ate_id')
    .eq('id', licitacionId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Licitacion no encontrada');
  }

  if (existing.estado !== 'adjudicacion_pendiente') {
    throw new Error(
      `No se puede confirmar la adjudicacion: el estado actual es "${existing.estado}". Se requiere "adjudicacion_pendiente".`
    );
  }

  if (!existing.ganador_ate_id) {
    throw new Error(
      'Debe seleccionar un ATE ganador antes de confirmar la adjudicacion.'
    );
  }

  const newEstado: LicitacionEstado = esFne ? 'contrato_pendiente' : 'adjudicada_externo';

  // 2. Update estado and ganador_es_fne
  const { data: updated, error: updateError } = await supabase
    .from('licitaciones')
    .update({
      estado: newEstado,
      ganador_es_fne: esFne,
      fecha_adjudicacion: dateToString(new Date()),
    })
    .eq('id', licitacionId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Error al confirmar adjudicacion: ${updateError?.message || 'Error desconocido'}`);
  }

  // 3. Create historial entry
  const accion = esFne
    ? 'Adjudicada a ATE FNE — avanzado a Contrato Pendiente'
    : 'Adjudicada a proveedor externo';

  await supabase.from('licitacion_historial').insert({
    licitacion_id: licitacionId,
    accion,
    estado_anterior: 'adjudicacion_pendiente',
    estado_nuevo: newEstado,
    detalles: { es_fne: esFne },
    user_id: userId,
  });

  return updated as Licitacion;
}

// ============================================================
// linkContractToLicitacion (Phase 5)
// ============================================================

/**
 * Links a newly created contract to a licitacion.
 * Validates preconditions server-side, updates licitacion with contrato_id,
 * transitions estado to 'contrato_generado', creates historial entry.
 * Idempotent: if called again with same contrato_id, succeeds without error.
 */
export async function linkContractToLicitacion(
  supabase: SupabaseClient,
  licitacionId: string,
  contratoId: string,
  userId: string
): Promise<Licitacion> {
  // 1. Fetch current licitacion
  const { data: existing, error: fetchError } = await supabase
    .from('licitaciones')
    .select('id, estado, ganador_es_fne, contrato_id, carta_adjudicacion_url')
    .eq('id', licitacionId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Licitacion no encontrada');
  }

  // Idempotent: if already linked to this contract, return current state
  if (existing.contrato_id === contratoId) {
    const { data: current } = await supabase
      .from('licitaciones')
      .select('*')
      .eq('id', licitacionId)
      .single();
    return current as Licitacion;
  }

  // 2. Validate preconditions
  if (existing.estado !== 'contrato_pendiente') {
    throw new Error(
      `No se puede generar contrato: el estado actual es "${existing.estado}". Se requiere "contrato_pendiente".`
    );
  }

  if (!existing.ganador_es_fne) {
    throw new Error(
      'No se puede generar contrato: esta licitacion fue adjudicada a un proveedor externo.'
    );
  }

  if (existing.contrato_id && existing.contrato_id !== contratoId) {
    throw new Error(
      'Esta licitacion ya tiene un contrato asociado. No se puede vincular otro contrato.'
    );
  }

  if (!existing.carta_adjudicacion_url) {
    throw new Error(
      'No se puede generar contrato: falta la carta de adjudicacion firmada.'
    );
  }

  // 3. Update licitacion
  const { data: updated, error: updateError } = await supabase
    .from('licitaciones')
    .update({
      contrato_id: contratoId,
      estado: 'contrato_generado' as LicitacionEstado,
    })
    .eq('id', licitacionId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Error al vincular contrato: ${updateError?.message || 'Error desconocido'}`);
  }

  // 4. Create historial entry
  await supabase.from('licitacion_historial').insert({
    licitacion_id: licitacionId,
    accion: 'Contrato generado y vinculado',
    estado_anterior: 'contrato_pendiente',
    estado_nuevo: 'contrato_generado',
    detalles: { contrato_id: contratoId },
    user_id: userId,
  });

  return updated as Licitacion;
}

// ============================================================
// closeLicitacion (Phase 5)
// ============================================================

/**
 * Closes a licitacion that was adjudicada to an external provider.
 * Validates estado is 'adjudicada_externo', transitions to 'cerrada',
 * creates historial entry.
 */
export async function closeLicitacion(
  supabase: SupabaseClient,
  licitacionId: string,
  userId: string
): Promise<Licitacion> {
  // 1. Fetch current licitacion
  const { data: existing, error: fetchError } = await supabase
    .from('licitaciones')
    .select('id, estado')
    .eq('id', licitacionId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Licitacion no encontrada');
  }

  if (existing.estado !== 'adjudicada_externo') {
    throw new Error(
      `No se puede cerrar la licitacion: el estado actual es "${existing.estado}". Se requiere "adjudicada_externo".`
    );
  }

  // 2. Update estado to cerrada
  const { data: updated, error: updateError } = await supabase
    .from('licitaciones')
    .update({ estado: 'cerrada' as LicitacionEstado })
    .eq('id', licitacionId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Error al cerrar licitacion: ${updateError?.message || 'Error desconocido'}`);
  }

  // 3. Create historial entry
  await supabase.from('licitacion_historial').insert({
    licitacion_id: licitacionId,
    accion: 'Licitacion cerrada (proveedor externo)',
    estado_anterior: 'adjudicada_externo',
    estado_nuevo: 'cerrada',
    detalles: {},
    user_id: userId,
  });

  return updated as Licitacion;
}
