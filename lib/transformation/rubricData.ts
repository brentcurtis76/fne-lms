/**
 * Pre-loaded rubric markdown data for transformation assessments
 * This allows Vercel serverless functions to access the content without filesystem reads
 */

import fs from 'fs';
import path from 'path';

// Cache the markdown content at build time
let personalizacionContent: string | null = null;
let aprendizajeContent: string | null = null;

export function getPersonalizacionMarkdown(): string {
  if (personalizacionContent === null) {
    const filePath = path.join(process.cwd(), 'PERSONALIZACION.md');
    personalizacionContent = fs.readFileSync(filePath, 'utf-8');
  }
  return personalizacionContent;
}

export function getAprendizajeMarkdown(): string {
  if (aprendizajeContent === null) {
    const filePath = path.join(process.cwd(), 'PROGRESION-APRENDIZAJE.md');
    aprendizajeContent = fs.readFileSync(filePath, 'utf-8');
  }
  return aprendizajeContent;
}
