import type { PropuestaDocumentoBibliotecaInsert } from '@/lib/propuestas/types';

/**
 * Seed data for propuesta_documentos_biblioteca
 * Supporting documents inventory for proposal generation.
 *
 * archivo_path values are Supabase storage PATHS (not URLs) in the bucket's
 * `documentos/<tipo>/<file>` convention — the SAME key format produced by the
 * library admin upload flow (`POST /api/propuestas/upload`, subfolder
 * `documentos/<tipo>`). They must NOT carry a leading `propuestas/` segment:
 * that is the bucket name, not part of the object key. A redundant `propuestas/`
 * prefix (the original seed bug) points rows at files that don't exist, which
 * silently dropped documents from the generated ZIP.
 *
 * The real files still have to be uploaded to the bucket (the admin UI does this
 * and overwrites archivo_path with the actual uploaded filename). As a backstop,
 * the generation endpoint now refuses to generate a proposal that selects a
 * document whose file is absent from storage, so a dead path fails loudly
 * instead of being frozen into the snapshot.
 *
 * IMPORTANT: The Certificado de Pertenencia expires 30 days from emission.
 * fecha_vencimiento must be updated whenever a new certificate is issued.
 */
export const DOCUMENTOS_SEED: PropuestaDocumentoBibliotecaInsert[] = [
  {
    nombre: 'Certificado de Pertenencia',
    tipo: 'certificado_pertenencia',
    descripcion: 'Certificado vigente MINEDUC — Fundación Instituto Relacional. Válido por 30 días desde emisión. Debe renovarse antes de incluirse en una propuesta.',
    archivo_path: 'documentos/certificado_pertenencia/certificado-pertenencia.pdf',
    fecha_emision: '2026-03-11',
    fecha_vencimiento: '2026-04-10',
    activo: true,
  },
  {
    nombre: 'Ficha de Servicio — Folio 52244',
    tipo: 'ficha_servicio',
    descripcion: 'Asesoría Integral para Desarrollar una Cultura de Innovación Educativa Centrada en el Aprendizaje. Ficha de Servicio registrada MINEDUC, 148 horas presenciales.',
    archivo_path: 'documentos/ficha_servicio/ficha-servicio-52244.pdf',
    fecha_emision: null,
    fecha_vencimiento: null,
    activo: true,
  },
  {
    nombre: 'Evaluaciones Clientes',
    tipo: 'evaluaciones_clientes',
    descripcion: 'Evaluaciones de clientes anteriores de FNE — establecimientos atendidos en programas Evoluciona y Preparación.',
    archivo_path: 'documentos/evaluaciones_clientes/evaluaciones-clientes.pdf',
    fecha_emision: null,
    fecha_vencimiento: null,
    activo: true,
  },
  {
    nombre: 'Carta de Recomendación — Colegio Santa Marta de Valdivia',
    tipo: 'carta_recomendacion',
    descripcion: 'Carta de recomendación del Colegio Santa Marta de Valdivia, emitida en enero 2025.',
    archivo_path: 'documentos/carta_recomendacion/carta-recomendacion-santa-marta.pdf',
    fecha_emision: '2025-01-20',
    fecha_vencimiento: null,
    activo: true,
  },
];
