/**
 * TypeScript Types for Transformation System
 *
 * Defines the 7 Vías de Transformación and their metadata
 *
 * @author Claude (with Brent Curtis)
 * @date 2025-01-27
 */

/**
 * Las 7 Vías de Transformación de Fundación Nueva Educación
 */
export const TRANSFORMATION_AREAS = [
  'aprendizaje',
  'personalizacion',
  'evaluacion',
  'proposito',
  'familias',
  'trabajo_docente',
  'liderazgo',
] as const;

export type TransformationArea = (typeof TRANSFORMATION_AREAS)[number];

/**
 * Etiquetas en español para cada vía
 */
export const AREA_LABELS: Record<TransformationArea, string> = {
  aprendizaje: 'Aprendizaje',
  personalizacion: 'Personalización',
  evaluacion: 'Evaluación',
  proposito: 'Propósito',
  familias: 'Familias',
  trabajo_docente: 'Trabajo Docente',
  liderazgo: 'Liderazgo',
};

/**
 * Iconos representativos para cada vía
 */
export const AREA_ICONS: Record<TransformationArea, string> = {
  aprendizaje: '📚',
  personalizacion: '🎯',
  evaluacion: '📊',
  proposito: '🌟',
  familias: '👨‍👩‍👧‍👦',
  trabajo_docente: '👩‍🏫',
  liderazgo: '🏆',
};

/**
 * Estado de disponibilidad de cada vía
 *
 * - available: Vía completamente funcional con rúbricas cargadas
 * - coming_soon: Vía en desarrollo, rúbricas pendientes de importación
 */
export type AreaAvailability = 'available' | 'coming_soon';

export const AREA_STATUS: Record<TransformationArea, AreaAvailability> = {
  aprendizaje: 'coming_soon',
  personalizacion: 'available', // Solo esta está lista actualmente
  evaluacion: 'coming_soon',
  proposito: 'coming_soon',
  familias: 'coming_soon',
  trabajo_docente: 'coming_soon',
  liderazgo: 'coming_soon',
};

/**
 * Descripciones breves de cada vía (para tooltips/ayuda)
 */
export const AREA_DESCRIPTIONS: Record<TransformationArea, string> = {
  aprendizaje:
    'Evalúa las prácticas pedagógicas centradas en el aprendizaje activo y significativo',
  personalizacion:
    'Mide el nivel de personalización del aprendizaje según las necesidades de cada estudiante',
  evaluacion:
    'Analiza los sistemas de evaluación formativa y su impacto en el aprendizaje',
  proposito:
    'Evalúa la claridad y vivencia del propósito institucional en la comunidad educativa',
  familias:
    'Mide el nivel de participación e involucramiento de las familias en el proceso educativo',
  trabajo_docente:
    'Analiza las prácticas de colaboración, desarrollo profesional y bienestar docente',
  liderazgo:
    'Evalúa las prácticas de liderazgo distribuido y gestión del cambio institucional',
};

/**
 * Colores institucionales FNE para cada nivel de desarrollo
 */
export const LEVEL_COLORS = {
  1: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    badge: 'bg-slate-400',
    hex: '#94a3b8',
  },
  2: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badge: 'bg-[#fdb933]',
    hex: '#fdb933',
  },
  3: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badge: 'bg-[#00365b]',
    hex: '#00365b',
  },
  4: {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-blue-900',
    badge: 'bg-[#00365b]',
    hex: '#0066b3',
  },
} as const;

export const LEVEL_LABELS = {
  1: 'Incipiente',
  2: 'En Desarrollo',
  3: 'Avanzado',
  4: 'Consolidado',
} as const;

/**
 * Helper function: Verifica si un área está disponible
 */
export function isAreaAvailable(area: TransformationArea): boolean {
  return AREA_STATUS[area] === 'available';
}

/**
 * Helper function: Obtiene solo las áreas disponibles
 */
export function getAvailableAreas(): TransformationArea[] {
  return TRANSFORMATION_AREAS.filter(area => AREA_STATUS[area] === 'available');
}

/**
 * Helper function: Obtiene metadata completa de un área
 */
export function getAreaMetadata(area: TransformationArea) {
  return {
    area,
    label: AREA_LABELS[area],
    icon: AREA_ICONS[area],
    status: AREA_STATUS[area],
    description: AREA_DESCRIPTIONS[area],
    isAvailable: isAreaAvailable(area),
  };
}
