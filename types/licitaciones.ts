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
  contrato_pendiente: { label: 'Contrato Pendiente', color: 'text-purple-800', bg: 'bg-purple-100' },
  contrato_generado: { label: 'Contrato Generado', color: 'text-green-800', bg: 'bg-green-100' },
  adjudicada_externo: { label: 'Adjudicada (Externa)', color: 'text-teal-800', bg: 'bg-teal-100' },
  cerrada: { label: 'Cerrada', color: 'text-gray-800', bg: 'bg-gray-200' },
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
    name: string;
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
});

export type LicitacionFilters = z.infer<typeof LicitacionFiltersSchema>;
