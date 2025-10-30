/**
 * Parser wrapper for PROGRESION-APRENDIZAJE.md
 * Uses shared parseAreaMarkdown infrastructure
 */

import { parseAreaMarkdown, getFlattenedSections, type AreaQuestions } from './parseAreaQuestions';

// Re-export types for convenience
export type { LevelOption, AccionSection, Accion, AreaQuestions } from './parseAreaQuestions';

/**
 * Parse PROGRESION-APRENDIZAJE.md content and extract structured questions
 * Expected structure: 6 objetivos, 17 acciones, 68 total sections
 *
 * @param content - The file content as a string
 */
export function parseAprendizajeMD(content: string): AreaQuestions {
  return parseAreaMarkdown(content, 'aprendizaje');
}

/**
 * Get all sections flattened for sequential display (68 total for Aprendizaje)
 * @param data - The parsed AreaQuestions data
 */
export { getFlattenedSections };
