/**
 * Markdown Scenario Export/Import Utility
 *
 * Enables round-trip editing of QA scenarios via markdown.
 * Export scenarios to markdown, edit in any text editor, import back.
 */

import type {
  QAScenario,
  QAScenarioStep,
  QAPrecondition,
  FeatureArea,
  CreateScenarioRequest,
} from '@/types/qa';
import { FEATURE_AREA_LABELS } from '@/types/qa';

// Reverse lookup for feature areas
const FEATURE_AREA_FROM_LABEL: Record<string, FeatureArea> = Object.entries(
  FEATURE_AREA_LABELS
).reduce((acc, [key, value]) => {
  acc[value.toLowerCase()] = key as FeatureArea;
  return acc;
}, {} as Record<string, FeatureArea>);

/**
 * Export a single scenario to markdown format.
 */
export function scenarioToMarkdown(scenario: QAScenario): string {
  let md = '';

  // Header
  md += `# ${scenario.name}\n\n`;

  // Metadata block
  md += `## Metadatos\n\n`;
  md += `- **ID:** ${scenario.id}\n`;
  md += `- **Área:** ${FEATURE_AREA_LABELS[scenario.feature_area] || scenario.feature_area}\n`;
  md += `- **Rol requerido:** ${scenario.role_required}\n`;
  md += `- **Prioridad:** ${scenario.priority}\n`;
  md += `- **Duración estimada:** ${scenario.estimated_duration_minutes} minutos\n`;
  md += `- **Estado:** ${scenario.is_active ? 'Activo' : 'Inactivo'}\n`;
  md += '\n';

  // Description
  if (scenario.description) {
    md += `## Descripción\n\n${scenario.description}\n\n`;
  }

  // Preconditions
  if (scenario.preconditions && scenario.preconditions.length > 0) {
    md += `## Precondiciones\n\n`;
    scenario.preconditions.forEach((pre, i) => {
      md += `${i + 1}. [${pre.type}] ${pre.description}\n`;
    });
    md += '\n';
  }

  // Steps
  md += `## Pasos\n\n`;
  scenario.steps.forEach((step, i) => {
    md += `### Paso ${step.index || i + 1}\n\n`;
    md += `**Instrucción:** ${step.instruction}\n\n`;
    md += `**Resultado esperado:** ${step.expectedOutcome}\n\n`;
    if (step.route) {
      md += `- Ruta: \`${step.route}\`\n`;
    }
    if (step.elementToCheck) {
      md += `- Elemento a verificar: \`${step.elementToCheck}\`\n`;
    }
    md += `- Capturar en fallo: ${step.captureOnFail ? 'Sí' : 'No'}\n`;
    md += `- Capturar en éxito: ${step.captureOnPass ? 'Sí' : 'No'}\n`;
    md += '\n';
  });

  return md;
}

/**
 * Export multiple scenarios to a single markdown document.
 */
export function scenariosToMarkdown(scenarios: QAScenario[]): string {
  let md = `# Escenarios de Prueba QA\n\n`;
  md += `Exportado: ${new Date().toLocaleString('es-CL')}\n\n`;
  md += `Total de escenarios: ${scenarios.length}\n\n`;
  md += `---\n\n`;

  scenarios.forEach((scenario, i) => {
    if (i > 0) {
      md += '\n---\n\n';
    }
    md += scenarioToMarkdown(scenario);
  });

  return md;
}

/**
 * Parse a single scenario from markdown.
 * Returns null if parsing fails.
 */
export function parseScenarioFromMarkdown(markdown: string): CreateScenarioRequest | null {
  try {
    const lines = markdown.split('\n');
    let currentSection = '';
    let currentStep: Partial<QAScenarioStep> | null = null;

    const scenario: Partial<CreateScenarioRequest> = {
      preconditions: [],
      steps: [],
    };

    let stepIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Parse title (# Name)
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        scenario.name = line.substring(2).trim();
        continue;
      }

      // Parse section headers
      if (line.startsWith('## ')) {
        // Save current step if any
        if (currentStep && currentStep.instruction) {
          scenario.steps?.push({
            index: currentStep.index || stepIndex,
            instruction: currentStep.instruction,
            expectedOutcome: currentStep.expectedOutcome || '??? (NEEDS CONFIRMATION)',
            route: currentStep.route,
            elementToCheck: currentStep.elementToCheck,
            captureOnFail: currentStep.captureOnFail ?? true,
            captureOnPass: currentStep.captureOnPass ?? false,
          });
          currentStep = null;
        }

        currentSection = line.substring(3).toLowerCase().trim();
        continue;
      }

      // Parse step headers
      if (line.startsWith('### Paso')) {
        // Save previous step
        if (currentStep && currentStep.instruction) {
          scenario.steps?.push({
            index: currentStep.index || stepIndex,
            instruction: currentStep.instruction,
            expectedOutcome: currentStep.expectedOutcome || '??? (NEEDS CONFIRMATION)',
            route: currentStep.route,
            elementToCheck: currentStep.elementToCheck,
            captureOnFail: currentStep.captureOnFail ?? true,
            captureOnPass: currentStep.captureOnPass ?? false,
          });
        }

        stepIndex++;
        currentStep = { index: stepIndex };
        currentSection = 'step';
        continue;
      }

      // Parse metadata
      if (currentSection === 'metadatos') {
        if (line.startsWith('- **Área:**')) {
          const areaLabel = line.replace('- **Área:**', '').trim().toLowerCase();
          scenario.feature_area = FEATURE_AREA_FROM_LABEL[areaLabel] || (areaLabel as FeatureArea);
        } else if (line.startsWith('- **Rol requerido:**')) {
          scenario.role_required = line.replace('- **Rol requerido:**', '').trim();
        } else if (line.startsWith('- **Prioridad:**')) {
          scenario.priority = parseInt(line.replace('- **Prioridad:**', '').trim()) || 2;
        } else if (line.startsWith('- **Duración estimada:**')) {
          const duration = line.replace('- **Duración estimada:**', '').trim();
          scenario.estimated_duration_minutes = parseInt(duration) || 5;
        }
      }

      // Parse description
      if (currentSection === 'descripción' && line && !line.startsWith('#')) {
        scenario.description = (scenario.description || '') + line + '\n';
      }

      // Parse preconditions
      if (currentSection === 'precondiciones' && line) {
        const match = line.match(/^\d+\.\s*\[(\w+)\]\s*(.+)$/);
        if (match) {
          scenario.preconditions?.push({
            type: match[1] as 'role' | 'data' | 'navigation' | 'custom',
            description: match[2].trim(),
          });
        }
      }

      // Parse step content
      if (currentSection === 'step' || currentSection === 'pasos') {
        if (line.startsWith('**Instrucción:**')) {
          if (currentStep) {
            currentStep.instruction = line.replace('**Instrucción:**', '').trim();
          }
        } else if (line.startsWith('**Resultado esperado:**')) {
          if (currentStep) {
            currentStep.expectedOutcome = line.replace('**Resultado esperado:**', '').trim();
          }
        } else if (line.startsWith('- Ruta:')) {
          if (currentStep) {
            const route = line.replace('- Ruta:', '').trim().replace(/`/g, '');
            currentStep.route = route || undefined;
          }
        } else if (line.startsWith('- Elemento a verificar:')) {
          if (currentStep) {
            const elem = line.replace('- Elemento a verificar:', '').trim().replace(/`/g, '');
            currentStep.elementToCheck = elem || undefined;
          }
        } else if (line.startsWith('- Capturar en fallo:')) {
          if (currentStep) {
            currentStep.captureOnFail = line.includes('Sí');
          }
        } else if (line.startsWith('- Capturar en éxito:')) {
          if (currentStep) {
            currentStep.captureOnPass = line.includes('Sí');
          }
        }
      }
    }

    // Save last step
    if (currentStep && currentStep.instruction) {
      scenario.steps?.push({
        index: currentStep.index || stepIndex,
        instruction: currentStep.instruction,
        expectedOutcome: currentStep.expectedOutcome || '??? (NEEDS CONFIRMATION)',
        route: currentStep.route,
        elementToCheck: currentStep.elementToCheck,
        captureOnFail: currentStep.captureOnFail ?? true,
        captureOnPass: currentStep.captureOnPass ?? false,
      });
    }

    // Trim description
    if (scenario.description) {
      scenario.description = scenario.description.trim();
    }

    // Validate required fields
    if (!scenario.name || !scenario.feature_area || !scenario.role_required || !scenario.steps?.length) {
      console.error('Invalid scenario: missing required fields', scenario);
      return null;
    }

    return scenario as CreateScenarioRequest;
  } catch (error) {
    console.error('Error parsing markdown scenario:', error);
    return null;
  }
}

/**
 * Parse multiple scenarios from a markdown document.
 * Scenarios are separated by horizontal rules (---).
 */
export function parseScenariosFromMarkdown(markdown: string): {
  scenarios: CreateScenarioRequest[];
  errors: string[];
} {
  const scenarios: CreateScenarioRequest[] = [];
  const errors: string[] = [];

  // Split by horizontal rules, keeping the header
  const parts = markdown.split(/\n---\n/).filter((part) => part.trim());

  // Check if first part is a document header (starts with # Escenarios)
  let startIndex = 0;
  if (parts[0]?.includes('# Escenarios de Prueba QA')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Find the scenario start (# Name)
    const scenarioMatch = part.match(/^#\s+[^#]/m);
    if (!scenarioMatch) {
      errors.push(`Parte ${i + 1}: No se encontró título de escenario`);
      continue;
    }

    const scenario = parseScenarioFromMarkdown(part);
    if (scenario) {
      scenarios.push(scenario);
    } else {
      errors.push(`Parte ${i + 1}: Error al parsear escenario`);
    }
  }

  return { scenarios, errors };
}

/**
 * Check if a scenario has steps with "NEEDS CONFIRMATION" outcomes.
 */
export function hasUnconfirmedOutcomes(scenario: QAScenario | CreateScenarioRequest): boolean {
  return scenario.steps.some(
    (step) =>
      step.expectedOutcome.includes('???') ||
      step.expectedOutcome.includes('NEEDS CONFIRMATION')
  );
}

/**
 * Get count of unconfirmed outcomes in a scenario.
 */
export function countUnconfirmedOutcomes(scenario: QAScenario | CreateScenarioRequest): number {
  return scenario.steps.filter(
    (step) =>
      step.expectedOutcome.includes('???') ||
      step.expectedOutcome.includes('NEEDS CONFIRMATION')
  ).length;
}

const markdownScenarios = {
  scenarioToMarkdown,
  scenariosToMarkdown,
  parseScenarioFromMarkdown,
  parseScenariosFromMarkdown,
  hasUnconfirmedOutcomes,
  countUnconfirmedOutcomes,
};
export default markdownScenarios;
