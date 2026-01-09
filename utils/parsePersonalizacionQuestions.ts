/**
 * Parser wrapper for PERSONALIZACION.md
 * Uses shared parseAreaMarkdown infrastructure for consistency
 */

import { parseAreaMarkdown, getFlattenedSections as getFlattened, type AreaQuestions } from './parseAreaQuestions';

// Re-export types for backward compatibility
export type { LevelOption, AccionSection, Accion } from './parseAreaQuestions';

/**
 * Maintain backward compatibility with PersonalizacionQuestions interface
 * This allows existing code to continue working without changes
 */
export interface PersonalizacionQuestions {
  acciones: AreaQuestions['acciones'];
  totalSections: number;
}

/**
 * Parse PERSONALIZACION.md content and extract structured questions
 * Expected structure: 5 objetivos, 11 acciones, 44 total sections
 *
 * @param content - The file content as a string
 */
export function parsePersonalizacionMD(content: string): PersonalizacionQuestions {
  const result = parseAreaMarkdown(content, 'personalizacion');

  // Return in original interface format for backward compatibility
  return {
    acciones: result.acciones,
    totalSections: result.totalSections,
  };
}

/**
 * Get all sections flattened for sequential display (44 total for Personalización)
 * @param data - The parsed PersonalizacionQuestions data
 */
export function getFlattenedSections(data: PersonalizacionQuestions): Array<{
  sectionIndex: number;
  accionId: string;
  objetivoNumber: number;
  accionNumber: number;
  objetivoTitle: string;
  accionDescription: string;
  section: {
    type: 'accion' | 'cobertura' | 'frecuencia' | 'profundidad';
    questions: string[];
    levels?: Array<{
      value: 'incipiente' | 'en_desarrollo' | 'avanzado' | 'consolidado';
      label: string;
      description: string;
    }>;
  };
}> {
  // Convert to AreaQuestions format and use shared flattening logic
  const areaQuestions: AreaQuestions = {
    area: 'personalizacion',
    acciones: data.acciones,
    totalSections: data.totalSections,
  };

  return getFlattened(areaQuestions);
}
