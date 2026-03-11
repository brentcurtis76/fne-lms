/**
 * Type definitions for Proposal Generator feature
 * Mirrors the schema from docs/migrations/proposal-generator-tables.sql
 */

// ============================================================
// UNION TYPES
// ============================================================

export type FichaDimension = 'Liderazgo' | 'Gestión Pedagógica';
export type FichaCategoria = 'Asesoría' | 'Capacitación';

export type ConsultorCategoria =
  | 'comite_internacional'
  | 'equipo_fne'
  | 'asesor_internacional';

export type DocumentoTipo =
  | 'certificado_pertenencia'
  | 'evaluaciones_clientes'
  | 'carta_recomendacion'
  | 'ficha_servicio'
  | 'otro';

export type TipoServicio = 'preparacion' | 'evoluciona' | 'custom';

export type EstadoPropuesta =
  | 'pendiente'
  | 'generando'
  | 'completada'
  | 'error';

// ============================================================
// JSONB SUB-TYPES
// ============================================================

export interface EquipoTrabajoMember {
  nombre: string;
  formacion: string;
  anos_experiencia: number;
}

export interface FormacionAcademica {
  year: number;
  institution: string;
  degree: string;
}

export interface ExperienciaProfesional {
  empresa: string;
  cargo: string;
  funcion: string;
}

export interface Referencia {
  nombre: string;
  cargo: string;
  empresa: string;
  telefono?: string;
  periodo?: string;
}

export interface ImagenBloque {
  key: string;
  path: string; // Supabase storage PATH (not URL)
  alt: string;
}

export interface ConfiguracionDefault {
  horas_presenciales?: number;
  horas_sincronicas?: number;
  horas_asincronicas?: number;
  precio_uf?: number;
  precio_modelo?: 'per_hour' | 'fixed';
  forma_pago?: string;
  plataforma?: boolean;
}

export interface ConfiguracionPropuesta {
  horas: number;
  desglose: {
    presenciales: number;
    sincronicas: number;
    asincronicas: number;
  };
  consultores_ids: string[];
  precio_uf: number;
  precio_modelo: 'per_hour' | 'fixed';
  forma_pago: string;
  plataforma: boolean;
  modulos?: unknown[];
  [key: string]: unknown;
}

// ============================================================
// ROW INTERFACES
// ============================================================

/**
 * PropuestaFichaServicio — MINEDUC registered service
 */
export interface PropuestaFichaServicio {
  id: string;
  folio: number;
  nombre_servicio: string;
  dimension: string;
  categoria: string;
  horas_presenciales: number;
  horas_no_presenciales: number;
  total_horas: number;
  destinatarios: string[];
  objetivo_general: string | null;
  metodologia: string | null;
  equipo_trabajo: EquipoTrabajoMember[] | null;
  fecha_inscripcion: string | null; // DATE as ISO string
  activo: boolean;
  created_at: string;
}

/**
 * PropuestaConsultor — Consultant library entry
 */
export interface PropuestaConsultor {
  id: string;
  nombre: string;
  titulo: string;
  categoria: ConsultorCategoria;
  perfil_profesional: string | null;
  formacion_academica: FormacionAcademica[] | null;
  experiencia_profesional: ExperienciaProfesional[] | null;
  referencias: Referencia[] | null;
  especialidades: string[] | null;
  foto_path: string | null;     // Supabase storage PATH (not URL)
  cv_pdf_path: string | null;   // Supabase storage PATH (not URL)
  activo: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
}

/**
 * PropuestaDocumentoBiblioteca — Supporting document library
 */
export interface PropuestaDocumentoBiblioteca {
  id: string;
  nombre: string;
  tipo: DocumentoTipo;
  descripcion: string | null;
  archivo_path: string;   // Supabase storage PATH (not URL)
  fecha_emision: string | null;     // DATE as ISO string
  fecha_vencimiento: string | null; // DATE as ISO string
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * PropuestaContenidoBloque — Reusable content block
 */
export interface PropuestaContenidoBloque {
  id: string;
  clave: string;
  titulo: string;
  contenido: Record<string, unknown>;
  imagenes: ImagenBloque[] | null;
  programa_tipo: string | null; // NULL = universal
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * PropuestaPlantilla — Proposal template
 */
export interface PropuestaPlantilla {
  id: string;
  nombre: string;
  tipo_servicio: TipoServicio;
  ficha_id: string | null;
  bloques_orden: string[];
  horas_default: number | null;
  configuracion_default: ConfiguracionDefault | null;
  activo: boolean;
  created_at: string;
}

/**
 * PropuestaGenerada — Generated proposal audit record
 */
export interface PropuestaGenerada {
  id: string;
  licitacion_id: string | null;
  plantilla_id: string | null;
  ficha_id: string | null;
  configuracion: ConfiguracionPropuesta;
  consultores_ids: string[] | null;
  documentos_ids: string[] | null;
  archivo_path: string | null;  // Supabase storage PATH (not URL)
  pdf_sha256: string | null;
  estado: EstadoPropuesta;
  error_message: string | null;
  version: number;
  generado_por: string | null;
  created_at: string;
}

// ============================================================
// INSERT TYPES
// ============================================================

export type PropuestaFichaServicioInsert = Omit<
  PropuestaFichaServicio,
  'id' | 'created_at'
>;

export type PropuestaConsultorInsert = Omit<
  PropuestaConsultor,
  'id' | 'created_at' | 'updated_at'
>;

export type PropuestaDocumentoBibliotecaInsert = Omit<
  PropuestaDocumentoBiblioteca,
  'id' | 'created_at' | 'updated_at'
>;

export type PropuestaContenidoBloqueInsert = Omit<
  PropuestaContenidoBloque,
  'id' | 'created_at' | 'updated_at'
>;

export type PropuestaPlantillaInsert = Omit<
  PropuestaPlantilla,
  'id' | 'created_at'
>;

export type PropuestaGeneradaInsert = Omit<
  PropuestaGenerada,
  'id' | 'created_at' | 'version'
> & {
  version?: number;
};
