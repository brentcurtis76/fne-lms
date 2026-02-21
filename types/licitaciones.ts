/**
 * Licitaciones Module Types and Zod Schemas
 * Phase 2: Creation + Publicacion workflow
 */

import { z } from 'zod';

// ============================================================
// ESTADO (STATE MACHINE)
// ============================================================

export type LicitacionEstado =
  | 'borrador'
  | 'publicacion_pendiente'
  | 'recepcion_bases_pendiente'
  | 'propuestas_pendientes'
  | 'evaluacion_pendiente'
  | 'adjudicacion_pendiente'
  | 'contrato_pendiente'
  | 'contrato_generado'
  | 'adjudicada_externo'
  | 'cerrada';

export interface StatusDisplayInfo {
  label: string;
  color: string;
  bg: string;
}

export const ESTADO_DISPLAY: Record<LicitacionEstado, StatusDisplayInfo> = {
  borrador: { label: 'Borrador', color: 'text-gray-700', bg: 'bg-gray-100' },
  publicacion_pendiente: { label: 'Publicación Pendiente', color: 'text-yellow-800', bg: 'bg-yellow-100' },
  recepcion_bases_pendiente: { label: 'Recepción de Bases', color: 'text-blue-800', bg: 'bg-blue-100' },
  propuestas_pendientes: { label: 'Propuestas Pendientes', color: 'text-blue-800', bg: 'bg-blue-100' },
  evaluacion_pendiente: { label: 'Evaluación Pendiente', color: 'text-orange-800', bg: 'bg-orange-100' },
  adjudicacion_pendiente: { label: 'Adjudicación Pendiente', color: 'text-orange-800', bg: 'bg-orange-100' },
  contrato_pendiente: { label: 'Contrato Pendiente', color: 'text-gray-700', bg: 'bg-gray-100' },
  contrato_generado: { label: 'Contrato Generado', color: 'text-green-800', bg: 'bg-green-100' },
  adjudicada_externo: { label: 'Adjudicada (Externa)', color: 'text-green-800', bg: 'bg-green-100' },
  cerrada: { label: 'Cerrada', color: 'text-gray-800', bg: 'bg-gray-200' },
};

// ============================================================
// NEXT ACTION MAP
// ============================================================

export const NEXT_ACTION: Partial<Record<LicitacionEstado, string>> = {
  publicacion_pendiente: 'Registrar publicación',
  recepcion_bases_pendiente: 'Registrar ATEs y enviar bases',
  propuestas_pendientes: 'Subir propuestas de ATEs',
  evaluacion_pendiente: 'Completar evaluación',
  adjudicacion_pendiente: 'Confirmar adjudicación',
  contrato_pendiente: 'Generar contrato',
};

// ============================================================
// TIMELINE
// ============================================================

export interface TimelineDates {
  fecha_limite_solicitud_bases: string; // YYYY-MM-DD
  fecha_limite_consultas: string;
  fecha_inicio_propuestas: string;
  fecha_limite_propuestas: string;
  fecha_limite_evaluacion: string;
}

// ============================================================
// CORE TYPE
// ============================================================

export interface Licitacion {
  id: string;
  numero_licitacion: string;
  school_id: number;
  cliente_id: string;
  programa_id: string;
  nombre_licitacion: string;
  year: number;
  estado: LicitacionEstado;
  email_licitacion: string;
  monto_minimo: number;
  monto_maximo: number;
  tipo_moneda: 'UF' | 'CLP';
  duracion_minima: string;
  duracion_maxima: string;
  peso_evaluacion_tecnica: number;
  peso_evaluacion_economica: number;
  participantes_estimados?: number | null;
  modalidad_preferida?: string | null;
  fecha_publicacion?: string | null;
  fecha_limite_solicitud_bases?: string | null;
  fecha_limite_consultas?: string | null;
  fecha_inicio_propuestas?: string | null;
  fecha_limite_propuestas?: string | null;
  fecha_limite_evaluacion?: string | null;
  fecha_adjudicacion?: string | null;
  publicacion_imagen_url?: string | null;
  bases_documento_url?: string | null;
  evaluacion_pdf_url?: string | null;
  carta_adjudicacion_url?: string | null;
  monto_adjudicado_uf?: number | null;
  // Phase 4 fields (evaluation + adjudicacion)
  ganador_ate_id?: string | null;
  ganador_es_fne?: boolean | null;
  condiciones_pago?: string | null;
  contacto_coordinacion_nombre?: string | null;
  contacto_coordinacion_email?: string | null;
  contacto_coordinacion_telefono?: string | null;
  hora_inicio_evaluacion?: string | null;
  hora_fin_evaluacion?: string | null;
  fecha_oferta_ganadora?: string | null;
  contrato_id?: string | null;
  notas?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicitacionDetail extends Licitacion {
  school?: {
    id: number;
    name: string;
    code?: string | null;
    cliente_id?: string | null;
  } | null;
  cliente?: {
    id: string;
    nombre_legal: string;
    nombre_fantasia: string;
    rut: string;
    direccion: string;
    comuna?: string | null;
    ciudad?: string | null;
    nombre_representante: string;
    rut_representante: string;
  } | null;
  programa?: {
    id: string;
    nombre: string;
  } | null;
}

// ============================================================
// ZOD SCHEMAS
// ============================================================

export const CreateLicitacionSchema = z.object({
  school_id: z.coerce.number().int().positive('Escuela requerida'),
  programa_id: z.string().min(1, 'Programa requerido'),
  nombre_licitacion: z.string().min(1, 'Nombre requerido').max(500, 'Nombre demasiado largo'),
  email_licitacion: z.string().email('Correo electronico invalido'),
  monto_minimo: z.coerce.number().min(0, 'Monto minimo debe ser positivo'),
  monto_maximo: z.coerce.number().min(0, 'Monto maximo debe ser positivo'),
  tipo_moneda: z.enum(['UF', 'CLP']).default('UF'),
  duracion_minima: z.string().min(1, 'Duracion minima requerida'),
  duracion_maxima: z.string().min(1, 'Duracion maxima requerida'),
  peso_evaluacion_tecnica: z.coerce.number().int().min(1, 'Minimo 1%').max(99, 'Maximo 99%'),
  year: z.coerce.number().int().min(2024, 'Año minimo 2024').max(2030, 'Año maximo 2030'),
  participantes_estimados: z.coerce.number().int().positive().optional().nullable(),
  modalidad_preferida: z.enum(['Presencial', 'Virtual', 'Hibrido']).optional().nullable(),
  notas: z.string().max(2000, 'Notas demasiado largas').optional().nullable(),
}).refine(d => d.monto_maximo >= d.monto_minimo, {
  message: 'Presupuesto maximo debe ser mayor o igual al minimo',
  path: ['monto_maximo'],
});

export type CreateLicitacionInput = z.infer<typeof CreateLicitacionSchema>;

export const PublicacionSchema = z.object({
  fecha_publicacion: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'Fecha debe ser formato YYYY-MM-DD'
  ),
  publicacion_imagen_url: z.string().max(2048).optional().nullable(),
});

export type PublicacionInput = z.infer<typeof PublicacionSchema>;

export const UpdateTimelineSchema = z.object({
  fecha_limite_solicitud_bases: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fecha_limite_consultas: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fecha_inicio_propuestas: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fecha_limite_propuestas: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fecha_limite_evaluacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type UpdateTimelineInput = z.infer<typeof UpdateTimelineSchema>;

export const LicitacionFiltersSchema = z.object({
  school_id: z.coerce.number().int().positive().optional(),
  programa_id: z.string().optional(),
  year: z.coerce.number().int().optional(),
  estado: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  export: z.enum(['true', 'false']).optional(),
});

export type LicitacionFilters = z.infer<typeof LicitacionFiltersSchema>;

// ============================================================
// ATE (Asistencia Tecnica Educativa) TYPES
// ============================================================

export interface LicitacionAte {
  id: string;
  licitacion_id: string;
  nombre_ate: string;
  rut_ate?: string | null;
  nombre_contacto?: string | null;
  email?: string | null;
  telefono?: string | null;
  fecha_solicitud_bases?: string | null;
  fecha_envio_bases?: string | null;
  propuesta_url?: string | null;
  propuesta_filename?: string | null;
  propuesta_size?: number | null;
  propuesta_mime_type?: string | null;
  fecha_propuesta?: string | null;
  monto_propuesto?: number | null;
  puntaje_tecnico?: number | null;
  puntaje_economico?: number | null;
  // Phase 4 fields
  puntaje_tecnico_ponderado?: number | null;
  puntaje_economico_ponderado?: number | null;
  puntaje_total?: number | null;
  es_ganador?: boolean | null;
  notas?: string | null;
  created_at: string;
  updated_at: string;
}

export const CreateAteSchema = z.object({
  nombre_ate: z.string().min(1, 'Nombre ATE requerido').max(255, 'Nombre demasiado largo'),
  rut_ate: z.string().max(20, 'RUT demasiado largo').optional().nullable(),
  nombre_contacto: z.string().max(255, 'Nombre demasiado largo').optional().nullable(),
  email: z.string().email('Correo electronico invalido').optional().nullable(),
  telefono: z.string().max(50, 'Telefono demasiado largo').optional().nullable(),
  fecha_solicitud_bases: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional().nullable(),
});

export type CreateAteInput = z.infer<typeof CreateAteSchema>;

export const UpdateAteSchema = z.object({
  nombre_ate: z.string().min(1, 'Nombre ATE requerido').max(255).optional(),
  rut_ate: z.string().max(20).optional().nullable(),
  nombre_contacto: z.string().max(255).optional().nullable(),
  email: z.string().email('Correo invalido').optional().nullable(),
  telefono: z.string().max(50).optional().nullable(),
  fecha_solicitud_bases: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fecha_envio_bases: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
  // Proposal metadata (updated via PATCH after upload)
  propuesta_url: z.string().max(2048).optional().nullable(),
  propuesta_filename: z.string().max(255).optional().nullable(),
  propuesta_size: z.number().int().positive().optional().nullable(),
  propuesta_mime_type: z.string().max(100).optional().nullable(),
  fecha_propuesta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export type UpdateAteInput = z.infer<typeof UpdateAteSchema>;

// ============================================================
// CONSULTA TYPES
// ============================================================

export interface LicitacionConsulta {
  id: string;
  licitacion_id: string;
  ate_id?: string | null;
  pregunta: string;
  respuesta?: string | null;
  fecha_pregunta?: string | null;
  fecha_respuesta?: string | null;
  created_at: string;
  updated_at: string;
}

export const CreateConsultaSchema = z.object({
  pregunta: z.string().min(1, 'Pregunta requerida').max(2000, 'Pregunta demasiado larga'),
  respuesta: z.string().max(2000, 'Respuesta demasiado larga').optional().nullable(),
  fecha_pregunta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional().nullable(),
  fecha_respuesta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional().nullable(),
  ate_id: z.string().uuid('UUID invalido').optional().nullable(),
});

export type CreateConsultaInput = z.infer<typeof CreateConsultaSchema>;

// ============================================================
// BASES TEMPLATE TYPES
// ============================================================

export interface ProgramaBasesTemplate {
  id: string;
  programa_id: string;
  nombre_servicio: string;
  objetivo: string;
  objetivos_especificos: string[];
  especificaciones_admin: {
    frecuencia?: string;
    lugar?: string;
    contrapartes_tecnicas?: string;
    condiciones_pago?: string;
  };
  resultados_esperados: string[];
  requisitos_ate: string[];
  documentos_adjuntar: string[];
  condiciones_pago?: string | null;
  version: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export const BasesTemplateSchema = z.object({
  nombre_servicio: z.string().min(1, 'Nombre del servicio requerido').max(500),
  objetivo: z.string().min(1, 'Objetivo requerido').max(5000),
  objetivos_especificos: z.array(z.string().min(1)).min(1, 'Al menos un objetivo especifico requerido'),
  especificaciones_admin: z.object({
    frecuencia: z.string().max(1000).optional(),
    lugar: z.string().max(1000).optional(),
    contrapartes_tecnicas: z.string().max(1000).optional(),
    condiciones_pago: z.string().max(1000).optional(),
  }),
  resultados_esperados: z.array(z.string().min(1)).min(1, 'Al menos un resultado esperado requerido'),
  requisitos_ate: z.array(z.string().min(1)).min(1, 'Al menos un requisito ATE requerido'),
  documentos_adjuntar: z.array(z.string().min(1)).min(1, 'Al menos un documento requerido'),
  condiciones_pago: z.string().max(3000).optional().nullable(),
});

export type BasesTemplateInput = z.infer<typeof BasesTemplateSchema>;

// ============================================================
// ADVANCE STATE TYPES
// ============================================================

export const AdvanceStateSchema = z.object({
  target_estado: z.enum([
    'propuestas_pendientes',
    'evaluacion_pendiente',
    'adjudicacion_pendiente',
    'contrato_pendiente',
    'adjudicada_externo',
  ]),
});

export type AdvanceStateInput = z.infer<typeof AdvanceStateSchema>;

// ============================================================
// LICITACION DOCUMENTO TYPE
// ============================================================

export interface LicitacionDocumento {
  id: string;
  licitacion_id: string;
  tipo: string;
  nombre: string;
  storage_path: string;
  file_name: string;
  file_size?: number | null;
  mime_type?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

// ============================================================
// EVALUATION TYPES (Phase 4)
// ============================================================

export interface EvaluacionCriterio {
  id: string;
  programa_id: string;
  nombre_criterio: string;
  puntaje_maximo: number;
  descripcion?: string | null;
  orden: number;
  is_active: boolean;
}

export interface EvaluationScore {
  ate_id: string;
  criterio_id: string;
  puntaje: number;
  comentario?: string | null;
}

export interface CommitteeMember {
  nombre: string;
  rut?: string | null;
  cargo?: string | null;
  orden: number;
}

export interface AteCalculatedScore {
  id: string;
  nombre_ate: string;
  rut_ate?: string | null;
  monto_propuesto: number;
  puntaje_tecnico: number;
  puntaje_economico: number;
  puntaje_tecnico_ponderado: number;
  puntaje_economico_ponderado: number;
  puntaje_total: number;
  es_ganador: boolean;
  rank: number;
}

// Zod schemas for Phase 4 API validation

export const SaveEvaluationSchema = z.object({
  committee: z.array(z.object({
    nombre: z.string().min(1, 'Nombre requerido').max(255),
    rut: z.string().max(20).optional().nullable(),
    cargo: z.string().max(255).optional().nullable(),
    orden: z.number().int().min(1).max(3),
  })).min(1).max(3),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido').optional().nullable(),
  hora_fin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido').optional().nullable(),
  fecha_evaluacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido').optional().nullable(),
  scores: z.array(z.object({
    ate_id: z.string().uuid('UUID invalido'),
    criterio_id: z.string().uuid('UUID invalido'),
    puntaje: z.number().min(0, 'Puntaje debe ser >= 0').max(100, 'Puntaje no puede exceder 100'),
    comentario: z.string().max(2000).optional().nullable(),
  })),
  montos: z.array(z.object({
    ate_id: z.string().uuid('UUID invalido'),
    monto_propuesto: z.number().positive('Monto debe ser positivo').max(999999999999, 'Monto excede limite'),
  })),
});

export type SaveEvaluationInput = z.infer<typeof SaveEvaluationSchema>;

export const AdjudicacionSchema = z.object({
  ganador_ate_id: z.string().uuid('UUID invalido'),
  monto_adjudicado_uf: z.coerce.number().positive('Monto debe ser positivo').max(999999999, 'Monto excede limite').optional().nullable(),
  condiciones_pago: z.string().max(3000).optional().nullable(),
  fecha_oferta_ganadora: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  contacto_coordinacion_nombre: z.string().max(255).optional().nullable(),
  contacto_coordinacion_email: z.string().email('Correo invalido').optional().nullable(),
  contacto_coordinacion_telefono: z.string().max(50).optional().nullable(),
});

export type AdjudicacionInput = z.infer<typeof AdjudicacionSchema>;

export const ConfirmarAdjudicacionSchema = z.object({
  es_fne: z.boolean(),
});

export type ConfirmarAdjudicacionInput = z.infer<typeof ConfirmarAdjudicacionSchema>;

export const CriterioSchema = z.object({
  programa_id: z.string().min(1, 'Programa requerido'),
  nombre_criterio: z.string().min(1, 'Nombre requerido').max(255),
  puntaje_maximo: z.coerce.number().positive('Puntaje maximo debe ser positivo'),
  descripcion: z.string().max(2000).optional().nullable(),
  orden: z.coerce.number().int().min(0),
  is_active: z.boolean().default(true),
});

export type CriterioInput = z.infer<typeof CriterioSchema>;

export const UpdateCriterioSchema = CriterioSchema.partial().omit({ programa_id: true });
export type UpdateCriterioInput = z.infer<typeof UpdateCriterioSchema>;

// ============================================================
// PHASE 5: CONTRACT INTEGRATION + CLOSURE
// ============================================================

export const GenerateContractSchema = z.object({
  contrato_id: z.string().uuid('UUID de contrato invalido'),
});

export type GenerateContractInput = z.infer<typeof GenerateContractSchema>;

export const CloseLicitacionSchema = z.object({
  // No body fields required — closing just transitions estado
  confirmar: z.literal(true, {
    errorMap: () => ({ message: 'Debe confirmar el cierre de la licitacion' }),
  }),
});

export type CloseLicitacionInput = z.infer<typeof CloseLicitacionSchema>;

// Feriado type for holiday management
export interface FeriadoChile {
  id: number;
  fecha: string; // YYYY-MM-DD
  nombre: string;
  year: number;
}

export const FeriadoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha invalido. Use YYYY-MM-DD'),
  nombre: z.string().min(1, 'Nombre requerido').max(255, 'Nombre demasiado largo'),
});

export type FeriadoInput = z.infer<typeof FeriadoSchema>;

export const UpdateFeriadoSchema = z.object({
  id: z.number().int().positive('ID invalido'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha invalido. Use YYYY-MM-DD').optional(),
  nombre: z.string().min(1, 'Nombre requerido').max(255, 'Nombre demasiado largo').optional(),
});

export type UpdateFeriadoInput = z.infer<typeof UpdateFeriadoSchema>;
