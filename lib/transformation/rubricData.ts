/**
 * Pre-loaded rubric markdown data for transformation assessments
 * Uses embedded content for Vercel serverless compatibility
 */

import {
  PERSONALIZACION_CONTENT,
  APRENDIZAJE_CONTENT,
  EVALUACION_CONTENT
} from './rubricContent';

export function getPersonalizacionMarkdown(): string {
  return PERSONALIZACION_CONTENT;
}

export function getAprendizajeMarkdown(): string {
  return APRENDIZAJE_CONTENT;
}

export function getEvaluacionMarkdown(): string {
  return EVALUACION_CONTENT;
}
