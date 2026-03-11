import type { PropuestaDocumentoBibliotecaInsert } from '@/lib/propuestas/types';

/**
 * Seed data for propuesta_documentos_biblioteca
 * Supporting documents inventory for proposal generation.
 * Note: archivo_path values are Supabase storage PATHS (not URLs).
 * Actual files must be uploaded to the `propuestas` storage bucket separately.
 *
 * IMPORTANT: The Certificado de Pertenencia expires 30 days from emission.
 * fecha_vencimiento must be updated whenever a new certificate is issued.
 */
export const DOCUMENTOS_SEED: PropuestaDocumentoBibliotecaInsert[] = [
  {
    nombre: 'Certificado de Pertenencia',
    tipo: 'certificado_pertenencia',
    descripcion: 'Certificado vigente MINEDUC — Fundación Instituto Relacional. Válido por 30 días desde emisión. Debe renovarse antes de incluirse en una propuesta.',
    archivo_path: 'propuestas/documentos/certificado-pertenencia.pdf',
    fecha_emision: '2026-03-11',
    fecha_vencimiento: '2026-04-10',
    activo: true,
  },
  {
    nombre: 'Ficha de Servicio — Folio 52244',
    tipo: 'ficha_servicio',
    descripcion: 'Asesoría Integral para Desarrollar una Cultura de Innovación Educativa Centrada en el Aprendizaje. Ficha de Servicio registrada MINEDUC, 148 horas presenciales.',
    archivo_path: 'propuestas/documentos/ficha-servicio-52244.pdf',
    fecha_emision: null,
    fecha_vencimiento: null,
    activo: true,
  },
  {
    nombre: 'Evaluaciones Clientes',
    tipo: 'evaluaciones_clientes',
    descripcion: 'Evaluaciones de clientes anteriores de FNE — establecimientos atendidos en programas Evoluciona y Preparación.',
    archivo_path: 'propuestas/documentos/evaluaciones-clientes.pdf',
    fecha_emision: null,
    fecha_vencimiento: null,
    activo: true,
  },
  {
    nombre: 'Carta de Recomendación — Colegio Santa Marta de Valdivia',
    tipo: 'carta_recomendacion',
    descripcion: 'Carta de recomendación del Colegio Santa Marta de Valdivia, emitida en enero 2025.',
    archivo_path: 'propuestas/documentos/carta-recomendacion-santa-marta.pdf',
    fecha_emision: '2025-01-20',
    fecha_vencimiento: null,
    activo: true,
  },
];
