/**
 * Shared markdown parser for Transformation assessment areas
 * Handles PERSONALIZACION.md, PROGRESION-APRENDIZAJE.md, and PROGRESION-EVALUACION.md
 */

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
  objetivoNumber: number;
  accionNumber: number;
  objetivoTitle: string;
  accionDescription: string;
  sections: AccionSection[]; // Always 4 sections: accion, cobertura, frecuencia, profundidad
}

export interface AreaQuestions {
  area: string;
  acciones: Accion[];
  totalSections: number;
}

interface ExpectedStructure {
  totalAcciones: number;
  distribution: Record<number, number>; // objetivo number → accion count
}

const EXPECTED_STRUCTURES: Record<string, ExpectedStructure> = {
  personalizacion: {
    totalAcciones: 11,
    distribution: {
      1: 3,
      2: 2,
      3: 2,
      4: 2,
      5: 2,
    },
  },
  aprendizaje: {
    totalAcciones: 17,
    distribution: {
      1: 5,
      2: 4,
      3: 2,
      4: 2,
      5: 2,
      6: 2,
    },
  },
  evaluacion: {
    totalAcciones: 9,
    distribution: {
      1: 4,
      2: 5,
    },
  },
};

/**
 * Parse área-specific markdown content and extract structured questions
 * Handles both space-indented (Personalización) and tab-indented (Aprendizaje) formats
 *
 * @param content - The file content as a string
 * @param area - The área identifier ('personalizacion' or 'aprendizaje')
 */
export function parseAreaMarkdown(content: string, area: string): AreaQuestions {
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
    // CRITICAL: Trim leading/trailing whitespace (handles both spaces and tabs)
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

    // Match ACCIÓN line (with flexible whitespace)
    if (trimmed.match(/^ACCIÓN \d+:/i)) {
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
      const match = trimmed.match(/^ACCIÓN (\d+):\s*(.+)/i);
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
    if (isInPreguntasAbiertas && trimmed &&
        !trimmed.startsWith('COBERTURA') &&
        !trimmed.startsWith('FRECUENCIA') &&
        !trimmed.startsWith('PROFUNDIDAD') &&
        !trimmed.startsWith('AUTOEVALUACIÓN') &&
        !trimmed.startsWith('OBJETIVO') &&
        !trimmed.match(/^ACCIÓN \d+:/i)) {
      const question = trimmed.replace(/^¿/, '').replace(/\?$/, '').trim();
      if (question) {
        currentQuestions.push(`¿${question}?`);
      }
      continue;
    }

    // Parse level descriptions (when in AUTOEVALUACIÓN mode)
    // CRITICAL: trimmed line already has tabs/spaces removed
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

  // Get expected structure for this área
  const expectedStructure = EXPECTED_STRUCTURES[area];
  if (!expectedStructure) {
    throw new Error(`Unknown área: ${area}. Expected one of: ${Object.keys(EXPECTED_STRUCTURES).join(', ')}`);
  }

  // Validation: Ensure we have expected number of acciones
  if (acciones.length !== expectedStructure.totalAcciones) {
    const objetivoCounts: Record<number, number> = {};
    acciones.forEach(a => {
      objetivoCounts[a.objetivoNumber] = (objetivoCounts[a.objetivoNumber] || 0) + 1;
    });

    throw new Error(
      `Parser validation failed for área '${area}': Expected ${expectedStructure.totalAcciones} ACCIONes, found ${acciones.length}. ` +
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
      `Parser validation failed for área '${area}': ${invalidAcciones.length} ACCIONes don't have 4 sections. ` +
      `Details: ${details}`
    );
  }

  // Calculate actual total sections
  const actualTotalSections = acciones.reduce((sum, accion) => sum + accion.sections.length, 0);
  const expectedTotalSections = expectedStructure.totalAcciones * 4;

  // Validation: Ensure total matches expected
  if (actualTotalSections !== expectedTotalSections) {
    throw new Error(
      `Parser validation failed for área '${area}': Expected ${expectedTotalSections} total sections, found ${actualTotalSections}`
    );
  }

  return {
    area,
    acciones,
    totalSections: actualTotalSections,
  };
}

/**
 * Get all sections flattened for sequential display
 * @param data - The parsed AreaQuestions data
 */
export function getFlattenedSections(data: AreaQuestions): Array<{
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

  return flattened;
}
