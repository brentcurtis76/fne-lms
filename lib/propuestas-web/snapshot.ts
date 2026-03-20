/**
 * Snapshot builder for propuesta web view.
 * Captures ALL data needed to render the full proposal in the browser
 * without additional DB queries.
 */

// ============================================================
// Snapshot Types
// ============================================================

export interface SnapshotConsultant {
  nombre: string;
  titulo: string;
  bio: string;
  fotoPath: string | null;
  formacion: { year: number; institution: string; degree: string }[] | null;
  experiencia: { empresa: string; cargo: string; funcion: string }[] | null;
  especialidades: string[] | null;
}

export interface SnapshotModule {
  nombre: string;
  horas_presenciales: number;
  horas_sincronicas: number;
  horas_asincronicas: number;
  mes?: number;
}

export interface SnapshotPricing {
  mode: 'per_hour' | 'fixed';
  precioUf: number;
  totalHours: number;
  formaPago: string;
  fixedUf?: number;
}

export interface SnapshotContentSection {
  type: 'heading' | 'paragraph' | 'list' | 'image';
  text?: string;
  items?: string[];
  path?: string;
  level?: number;
}

export interface SnapshotContentBlock {
  key: string;
  titulo: string;
  contenido: {
    sections: SnapshotContentSection[];
  };
  imagenes: { key: string; path: string; alt: string }[] | null;
}

export interface SnapshotDocument {
  id: string;
  nombre: string;
  tipo: string;
  archivoPath: string;
  descripcion: string | null;
}

export interface ProposalSnapshot {
  // Metadata
  version: number;
  generatedAt: string;
  type: 'evoluciona' | 'preparacion';

  // School info
  schoolName: string;
  schoolLogoPath: string | null;

  // Program info
  programYear: number;
  serviceName: string;
  startMonth?: number;
  duration?: number;
  destinatarios?: string[];

  // Consultants
  consultants: SnapshotConsultant[];

  // Modules & hours
  modules: SnapshotModule[];
  horasPresenciales: number;
  horasSincronicas: number;
  horasAsincronicas: number;
  totalHours: number;

  // Pricing
  pricing: SnapshotPricing;

  // Content blocks (in order)
  contentBlocks: SnapshotContentBlock[];

  // Downloadable documents
  documents: SnapshotDocument[];

  // Licitacion metadata
  licitacion: {
    id: string;
    numero: string;
    nombre: string;
    year: number;
  } | null;

  // Ficha metadata
  ficha: {
    id: string;
    folio: number;
    nombre_servicio: string;
    dimension: string;
    categoria: string;
    total_horas: number;
    destinatarios: string[];
  } | null;
}

// ============================================================
// Builder
// ============================================================

export interface BuildSnapshotInput {
  config: {
    type: 'evoluciona' | 'preparacion';
    schoolName: string;
    schoolLogoPath?: string;
    programYear: number;
    serviceName: string;
    consultants: Array<{
      nombre: string;
      titulo: string;
      bio: string;
      fotoPath?: string;
    }>;
    modules: Array<{
      nombre: string;
      horas_presenciales: number;
      horas_sincronicas: number;
      horas_asincronicas: number;
      mes?: number;
    }>;
    horasPresenciales: number;
    horasSincronicas: number;
    horasAsincronicas: number;
    pricing: {
      mode: 'per_hour' | 'fixed';
      precioUf: number;
      totalHours: number;
      formaPago: string;
      fixedUf?: number;
    };
    contentBlocks: Array<{
      key: string;
      titulo: string;
      contenido: Record<string, unknown>;
      imagenes?: Array<unknown> | null;
    }>;
    startMonth?: number;
    duration?: number;
    destinatarios?: string[];
  };
  version: number;
  consultantRecords: Array<{
    nombre: string;
    foto_path: string | null;
    formacion_academica: { year: number; institution: string; degree: string }[] | null;
    experiencia_profesional: { empresa: string; cargo: string; funcion: string }[] | null;
    especialidades: string[] | null;
  }>;
  selectedDocuments: Array<{
    id: string;
    nombre: string;
    tipo: string;
    archivo_path: string | null;
    descripcion: string | null;
  }>;
  licitacion: {
    id: string;
    numero_licitacion: string;
    nombre_licitacion: string;
    year: number;
  } | null;
  ficha: {
    id: string;
    folio: number;
    nombre_servicio: string;
    dimension: string;
    categoria: string;
    total_horas: number;
    destinatarios: string[];
  } | null;
}

export function buildProposalSnapshot(input: BuildSnapshotInput): ProposalSnapshot {
  const { config, version, consultantRecords, selectedDocuments, licitacion, ficha } = input;

  // Merge consultant config data with DB records (photo URLs, CV, etc.)
  const consultants: SnapshotConsultant[] = config.consultants.map((c) => {
    const dbRecord = consultantRecords.find((r) => r.nombre === c.nombre);
    return {
      nombre: c.nombre,
      titulo: c.titulo,
      bio: c.bio,
      fotoPath: c.fotoPath ?? dbRecord?.foto_path ?? null,
      formacion: dbRecord?.formacion_academica ?? null,
      experiencia: dbRecord?.experiencia_profesional ?? null,
      especialidades: dbRecord?.especialidades ?? null,
    };
  });

  // Map content blocks
  const contentBlocks: SnapshotContentBlock[] = config.contentBlocks.map((block) => ({
    key: block.key,
    titulo: block.titulo,
    contenido: block.contenido as { sections: SnapshotContentSection[] },
    imagenes: (block.imagenes as SnapshotContentBlock['imagenes']) ?? null,
  }));

  // Map documents (only those with archivo_path)
  const documents: SnapshotDocument[] = selectedDocuments
    .filter((d) => d.archivo_path)
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      tipo: d.tipo,
      archivoPath: d.archivo_path!,
      descripcion: d.descripcion,
    }));

  const totalHours = config.horasPresenciales + config.horasSincronicas + config.horasAsincronicas;

  return {
    version,
    generatedAt: new Date().toISOString(),
    type: config.type,
    schoolName: config.schoolName,
    schoolLogoPath: config.schoolLogoPath ?? null,
    programYear: config.programYear,
    serviceName: config.serviceName,
    startMonth: config.startMonth,
    duration: config.duration,
    destinatarios: config.destinatarios,
    consultants,
    modules: config.modules.map((m) => ({
      nombre: m.nombre,
      horas_presenciales: m.horas_presenciales,
      horas_sincronicas: m.horas_sincronicas,
      horas_asincronicas: m.horas_asincronicas,
      mes: m.mes,
    })),
    horasPresenciales: config.horasPresenciales,
    horasSincronicas: config.horasSincronicas,
    horasAsincronicas: config.horasAsincronicas,
    totalHours,
    pricing: { ...config.pricing },
    contentBlocks,
    documents,
    licitacion: licitacion
      ? {
          id: licitacion.id,
          numero: licitacion.numero_licitacion,
          nombre: licitacion.nombre_licitacion,
          year: licitacion.year,
        }
      : null,
    ficha: ficha
      ? {
          id: ficha.id,
          folio: ficha.folio,
          nombre_servicio: ficha.nombre_servicio,
          dimension: ficha.dimension,
          categoria: ficha.categoria,
          total_horas: ficha.total_horas,
          destinatarios: ficha.destinatarios,
        }
      : null,
  };
}
