/**
 * Parser wrapper for PROGRESION-EVALUACION.md
 * Uses shared parseAreaMarkdown infrastructure
 */

import { parseAreaMarkdown, getFlattenedSections, type AreaQuestions } from './parseAreaQuestions';

// Re-export types for convenience
export type { LevelOption, AccionSection, Accion, AreaQuestions } from './parseAreaQuestions';

/**
 * Parse PROGRESION-EVALUACION.md content and extract structured questions
 * Expected structure: 2 objetivos, 9 acciones, 36 total sections
 *
 * @param content - The file content as a string
 */
export function parseEvaluacionMD(content: string): AreaQuestions {
  return parseAreaMarkdown(content, 'evaluacion');
}

/**
 * Get all sections flattened for sequential display (36 total for Evaluación)
 * @param data - The parsed AreaQuestions data
 */
export { getFlattenedSections };
