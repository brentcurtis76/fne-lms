// Type definitions
export interface LevelOption {
  value: 'incipiente' | 'en_desarrollo' | 'avanzado' | 'consolidado';
  label: string;
  description: string;
}

export interface AccionSection {
  type: 'accion' | 'cobertura' | 'frecuencia' | 'profundidad';
  questions: string[]; // Array of question strings
  levels?: LevelOption[]; // Only for cobertura, frecuencia, profundidad
}

export interface Accion {
  id: string; // e.g., "objetivo1_accion1"
  objetivoNumber: number; // 1-6
  accionNumber: number; // 1-3
  objetivoTitle: string; // Full objective title
  accionDescription: string; // ACCIÓN description line
  sections: AccionSection[]; // Always 4 sections: accion, cobertura, frecuencia, profundidad
}

export interface PersonalizacionQuestions {
  acciones: Accion[]; // 11 ACCIONes total
  totalSections: number; // Should be 44 (11 × 4)
}

/**
 * Parse PERSONALIZACIÓN.MD content and extract structured questions
 * @param content - The file content as a string
 */
export function parsePersonalizacionMD(content: string): PersonalizacionQuestions {
  const lines = content.split('\n');

  const acciones: Accion[] = [];
  let currentObjetivoNumber = 0;
  let currentObjetivoTitle = '';
  let currentAccionNumber = 0;
  let currentAccionDescription = '';
  let currentSectionType: 'accion' | 'cobertura' | 'frecuencia' | 'profundidad' | null = null;
  let currentQuestions: string[] = [];
  let currentLevels: LevelOption[] = [];
  let sections: AccionSection[] = [];
  let isInPreguntasAbiertas = false;
  let isInAutoevaluacion = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Match OBJETIVO line
    if (trimmed.startsWith('OBJETIVO ')) {
      // Flush current section before saving previous ACCIÓN (if we're switching objetivos)
      if (currentSectionType && (currentQuestions.length > 0 || currentLevels.length > 0)) {
        sections.push({
          type: currentSectionType,
          questions: [...currentQuestions],
          levels: currentLevels.length > 0 ? [...currentLevels] : undefined,
        });
      }

      // Save previous ACCIÓN before switching objetivos
      if (currentAccionDescription && sections.length > 0) {
        acciones.push({
          id: `objetivo${currentObjetivoNumber}_accion${currentAccionNumber}`,
          objetivoNumber: currentObjetivoNumber,
          accionNumber: currentAccionNumber,
          objetivoTitle: currentObjetivoTitle,
          accionDescription: currentAccionDescription,
          sections: [...sections],
        });
        // Reset for new objetivo
        sections = [];
        currentAccionDescription = '';
        currentSectionType = null;
        currentQuestions = [];
        currentLevels = [];
        isInPreguntasAbiertas = false;
        isInAutoevaluacion = false;
      }

      // Now update objetivo metadata
      const match = trimmed.match(/^OBJETIVO (\d+):\s*(.+)/);
      if (match) {
        currentObjetivoNumber = parseInt(match[1]);
        currentObjetivoTitle = match[2].trim();
      }
      continue;
    }

    // Match ACCIÓN line
    if (trimmed.match(/^\s*ACCIÓN \d+:/)) {
      // Flush current section before saving previous ACCIÓN
      if (currentSectionType && (currentQuestions.length > 0 || currentLevels.length > 0)) {
        sections.push({
          type: currentSectionType,
          questions: [...currentQuestions],
          levels: currentLevels.length > 0 ? [...currentLevels] : undefined,
        });
      }

      // Save previous ACCIÓN if it exists
      if (currentAccionDescription && sections.length > 0) {
        acciones.push({
          id: `objetivo${currentObjetivoNumber}_accion${currentAccionNumber}`,
          objetivoNumber: currentObjetivoNumber,
          accionNumber: currentAccionNumber,
          objetivoTitle: currentObjetivoTitle,
          accionDescription: currentAccionDescription,
          sections: [...sections],
        });
      }

      // Extract ACCIÓN number and description
      const match = trimmed.match(/^\s*ACCIÓN (\d+):\s*(.+)/);
      if (match) {
        currentAccionNumber = parseInt(match[1]);
        currentAccionDescription = match[2].trim();
        sections = [];
        currentSectionType = null;
        currentQuestions = [];
        currentLevels = [];
        isInPreguntasAbiertas = false;
        isInAutoevaluacion = false;
      }
      continue;
    }

    // Match COBERTURA, FRECUENCIA, PROFUNDIDAD sections (with or without colon)
    if (trimmed === 'COBERTURA:' || trimmed === 'COBERTURA' ||
        trimmed === 'FRECUENCIA:' || trimmed === 'FRECUENCIA' ||
        trimmed === 'PROFUNDIDAD:' || trimmed === 'PROFUNDIDAD') {
      // Save previous section if exists
      if (currentSectionType) {
        sections.push({
          type: currentSectionType,
          questions: [...currentQuestions],
          levels: currentLevels.length > 0 ? [...currentLevels] : undefined,
        });
      }

      currentSectionType = trimmed.replace(':', '').toLowerCase() as 'cobertura' | 'frecuencia' | 'profundidad';
      currentQuestions = [];
      currentLevels = [];
      isInPreguntasAbiertas = false;
      isInAutoevaluacion = false;
      continue;
    }

    // Match PREGUNTAS ABIERTAS
    if (trimmed.startsWith('PREGUNTAS ABIERTAS') || trimmed === 'Preguntas Abiertas:') {
      // If we were in autoevaluación of a dimension section, we need to save that section first
      if (currentSectionType && currentSectionType !== 'accion' && isInAutoevaluacion) {
        sections.push({
          type: currentSectionType,
          questions: [...currentQuestions],
          levels: currentLevels.length > 0 ? [...currentLevels] : undefined,
        });
        currentSectionType = null;
        currentQuestions = [];
        currentLevels = [];
      }

      // If this is right after ACCIÓN line, it's the ACCIÓN section
      if (!currentSectionType && currentAccionDescription) {
        currentSectionType = 'accion';
        currentQuestions = [];
        currentLevels = [];
      }

      isInPreguntasAbiertas = true;
      isInAutoevaluacion = false;

      // Check if question is on same line
      const questionMatch = trimmed.match(/PREGUNTAS ABIERTAS:\s*(.+)/);
      if (questionMatch && questionMatch[1].trim()) {
        currentQuestions.push(questionMatch[1].trim());
      }
      continue;
    }

    // Match AUTOEVALUACIÓN
    if (trimmed.startsWith('AUTOEVALUACIÓN')) {
      // Save ACCIÓN section before moving to dimension's AUTOEVALUACIÓN
      if (currentSectionType === 'accion' && currentQuestions.length > 0) {
        sections.push({
          type: 'accion',
          questions: [...currentQuestions],
        });
        currentSectionType = null;
        currentQuestions = [];
      }

      isInPreguntasAbiertas = false;
      isInAutoevaluacion = true;
      continue;
    }

    // Parse question lines (when in PREGUNTAS ABIERTAS mode)
    if (isInPreguntasAbiertas && trimmed && !trimmed.startsWith('COBERTURA') && !trimmed.startsWith('FRECUENCIA') && !trimmed.startsWith('PROFUNDIDAD') && !trimmed.startsWith('AUTOEVALUACIÓN') && !trimmed.startsWith('OBJETIVO') && !trimmed.startsWith('ACCIÓN')) {
      const question = trimmed.replace(/^¿/, '').replace(/\?$/, '').trim();
      if (question) {
        currentQuestions.push(`¿${question}?`);
      }
      continue;
    }

    // Parse level descriptions (when in AUTOEVALUACIÓN mode)
    if (isInAutoevaluacion && trimmed) {
      const incipienteMatch = trimmed.match(/^Incipiente:\s*(.+)/);
      const desarrolloMatch = trimmed.match(/^En desarrollo:\s*(.+)/);
      const avanzadoMatch = trimmed.match(/^Avanzado:\s*(.+)/);
      const consolidadoMatch = trimmed.match(/^Consolidado:\s*(.+)/);

      if (incipienteMatch) {
        currentLevels.push({
          value: 'incipiente',
          label: 'Incipiente',
          description: incipienteMatch[1].trim(),
        });
      } else if (desarrolloMatch) {
        currentLevels.push({
          value: 'en_desarrollo',
          label: 'En desarrollo',
          description: desarrolloMatch[1].trim(),
        });
      } else if (avanzadoMatch) {
        currentLevels.push({
          value: 'avanzado',
          label: 'Avanzado',
          description: avanzadoMatch[1].trim(),
        });
      } else if (consolidadoMatch) {
        currentLevels.push({
          value: 'consolidado',
          label: 'Consolidado',
          description: consolidadoMatch[1].trim(),
        });
      }
      continue;
    }
  }

  // Flush final section before saving last ACCIÓN
  if (currentSectionType && (currentQuestions.length > 0 || currentLevels.length > 0)) {
    sections.push({
      type: currentSectionType,
      questions: [...currentQuestions],
      levels: currentLevels.length > 0 ? [...currentLevels] : undefined,
    });
  }

  // Save last ACCIÓN
  if (currentAccionDescription && sections.length > 0) {
    acciones.push({
      id: `objetivo${currentObjetivoNumber}_accion${currentAccionNumber}`,
      objetivoNumber: currentObjetivoNumber,
      accionNumber: currentAccionNumber,
      objetivoTitle: currentObjetivoTitle,
      accionDescription: currentAccionDescription,
      sections: [...sections],
    });
  }

  // Validation: Ensure we have exactly 11 acciones
  if (acciones.length !== 11) {
    const objetivoCounts: Record<number, number> = {};
    acciones.forEach(a => {
      objetivoCounts[a.objetivoNumber] = (objetivoCounts[a.objetivoNumber] || 0) + 1;
    });

    throw new Error(
      `Parser validation failed: Expected 11 ACCIONes, found ${acciones.length}. ` +
      `Distribution by objetivo: ${JSON.stringify(objetivoCounts)}`
    );
  }

  // Validation: Ensure each acción has exactly 4 sections
  const invalidAcciones = acciones.filter(a => a.sections.length !== 4);
  if (invalidAcciones.length > 0) {
    const details = invalidAcciones.map(a =>
      `${a.id}: ${a.sections.length} sections (${a.sections.map(s => s.type).join(', ')})`
    ).join('; ');

    throw new Error(
      `Parser validation failed: ${invalidAcciones.length} ACCIONes don't have 4 sections. ` +
      `Details: ${details}`
    );
  }

  // Calculate actual total sections
  const actualTotalSections = acciones.reduce((sum, accion) => sum + accion.sections.length, 0);

  // Validation: Ensure total is exactly 44
  if (actualTotalSections !== 44) {
    throw new Error(
      `Parser validation failed: Expected 44 total sections, found ${actualTotalSections}`
    );
  }

  return {
    acciones,
    totalSections: actualTotalSections,
  };
}

/**
 * Get all sections flattened for sequential display (44 total)
 * @param data - The parsed PersonalizacionQuestions data
 */
export function getFlattenedSections(data: PersonalizacionQuestions): Array<{
  sectionIndex: number;
  accionId: string;
  objetivoNumber: number;
  accionNumber: number;
  objetivoTitle: string;
  accionDescription: string;
  section: AccionSection;
}> {
  const flattened: Array<{
    sectionIndex: number;
    accionId: string;
    objetivoNumber: number;
    accionNumber: number;
    objetivoTitle: string;
    accionDescription: string;
    section: AccionSection;
  }> = [];

  let sectionIndex = 0;
  data.acciones.forEach((accion) => {
    accion.sections.forEach((section) => {
      flattened.push({
        sectionIndex,
        accionId: accion.id,
        objetivoNumber: accion.objetivoNumber,
        accionNumber: accion.accionNumber,
        objetivoTitle: accion.objetivoTitle,
        accionDescription: accion.accionDescription,
        section,
      });
      sectionIndex++;
    });
  });

  // Validation: Ensure we have exactly 44 flattened sections
  if (flattened.length !== 44) {
    throw new Error(
      `getFlattenedSections validation failed: Expected 44 sections, got ${flattened.length}`
    );
  }

  return flattened;
}
