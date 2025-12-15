/**
 * Pre-loaded rubric markdown data for transformation assessments
 * This allows Vercel serverless functions to access the content without filesystem reads
 */

import fs from 'fs';
import path from 'path';

// Cache the markdown content at build time
let personalizacionContent: string | null = null;
let aprendizajeContent: string | null = null;
let evaluacionContent: string | null = null;

export function getPersonalizacionMarkdown(): string {
  if (personalizacionContent === null) {
    const filePath = path.join(process.cwd(), 'Progresión 3', 'PROGRESION-PERSONALIZACION.md');
    personalizacionContent = fs.readFileSync(filePath, 'utf-8');
  }
  return personalizacionContent;
}

export function getAprendizajeMarkdown(): string {
  if (aprendizajeContent === null) {
    const filePath = path.join(process.cwd(), 'Progresión 3', 'PROGRESION-APRENDIZAJE.md');
    aprendizajeContent = fs.readFileSync(filePath, 'utf-8');
  }
  return aprendizajeContent;
}

export function getEvaluacionMarkdown(): string {
  if (evaluacionContent === null) {
    const filePath = path.join(process.cwd(), 'Progresión 3', 'PROGRESION-EVALUACION.md');
    evaluacionContent = fs.readFileSync(filePath, 'utf-8');
  }
  return evaluacionContent;
}
