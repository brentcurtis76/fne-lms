import Anthropic from '@anthropic-ai/sdk';

interface DimensionResponse {
  rubricItemId?: string;  // UUID (optional for legacy)
  sectionId?: string;     // Semantic key like "objetivo1_accion1_accion"
  response?: string;
  answer?: string;        // Alternative field name used by SequentialQuestions
  suggestedLevel?: number | null;
  confirmedLevel?: number | null;
  level?: string;         // Alternative field name (incipiente, en_desarrollo, etc)
  lastUpdated?: string;
  timestamp?: string;     // Alternative field name
}

interface RubricItem {
  id: string;
  objective_number: number;
  objective_text: string;
  action_number: number;
  action_text: string;
  dimension: 'cobertura' | 'frecuencia' | 'profundidad';
  level_1_descriptor: string;
  level_2_descriptor: string;
  level_3_descriptor: string;
  level_4_descriptor: string;
  initial_questions: string[];
  display_order: number;
}

interface DimensionEvaluation {
  rubricItemId: string;
  dimension: string;
  level: number;
  reasoning: string;
  evidence_quote: string;
  next_steps: string[];
}

interface AssessmentEvaluation {
  overall_stage: number; // 1-4
  overall_stage_label: 'Incipiente' | 'Emergente' | 'Avanzado' | 'Consolidado';
  dimension_evaluations: DimensionEvaluation[];
  strengths: string[];
  growth_areas: string[];
  summary: string;
  recommendations: string[];
}

/**
 * Área-specific focus and terminology for evaluation prompts
 */
const AREA_FOCUS = {
  personalizacion: `
## ENFOQUE: PERSONALIZACIÓN

Esta vía se centra en:
- **Individualización del aprendizaje**: Planes Personales de Crecimiento (PPC)
- **Autoconocimiento del estudiante**: Reflexión sobre fortalezas, intereses y metas
- **Tutorías y acompañamiento**: Espacios de mentoría 1:1 o pequeños grupos
- **Flexibilidad de trayectorias**: Rutas diferenciadas según ritmo y estilo

**Terminología clave Personalización:**
- "Plan Personal de Crecimiento (PPC)": Documento donde estudiante define metas y estrategias
- "Tutorías": Espacios de acompañamiento individual o grupal
- "Portafolio de aprendizaje": Colección de evidencias del estudiante
- "Diseño Universal para el Aprendizaje (DUA)": Estrategias inclusivas en el aula
`,
  aprendizaje: `
## ENFOQUE: APRENDIZAJE

Esta vía se centra en:
- **Metodologías activas**: Aprendizaje Basado en Proyectos (ABP), aprendizaje cooperativo
- **Estudiante en el centro**: Exploración, indagación, construcción de conocimiento
- **Interdisciplinariedad**: Proyectos que integran múltiples asignaturas
- **Ambientes de aprendizaje**: Espacios físicos y virtuales que facilitan la colaboración

**Terminología clave Aprendizaje:**
- "ABP (Aprendizaje Basado en Proyectos)": Metodología donde estudiantes investigan y resuelven problemas reales
- "Proyectos interdisciplinarios": Integran objetivos de múltiples asignaturas
- "Cajas de aprendizaje": Recursos organizados por tema/proyecto para elección de estudiantes
- "Brújulas": Documentos guía para proyectos y evaluación
- "Equipos base": Grupos estables de estudiantes que colaboran durante el año
- "Ambientes de aprendizaje": Espacios flexibles que fomentan colaboración y autonomía
`,
  evaluacion: `
## ENFOQUE: EVALUACIÓN

Esta vía se centra en:
- **Evaluación formativa y formadora**: Estrategias continuas orientadas a acompañar el aprendizaje
- **Retroalimentación constructiva**: Feedback específico, oportuno y que impulsa la mejora
- **Autoevaluación y coevaluación**: Participación activa del estudiante en procesos evaluativos
- **Instrumentos diversificados**: Rúbricas, portafolios, observaciones, informes descriptivos (no solo exámenes)
- **Metacognición sistemática**: Reflexión sobre el propio proceso de aprendizaje

**Terminología clave Evaluación:**
- "Evaluación formativa": Evaluación continua que acompaña el proceso de aprendizaje, no solo certifica
- "Retroalimentación": Feedback cualitativo específico dirigido a mejorar, no solo calificaciones
- "Autoevaluación": El estudiante evalúa su propio proceso, desempeño y estrategias
- "Coevaluación": Estudiantes evalúan el trabajo de sus compañeros
- "Rúbrica": Instrumento que define criterios de desempeño en niveles claros
- "Portafolio": Colección de evidencias del aprendizaje del estudiante a lo largo del tiempo
- "Metacognición": Reflexión sobre cómo se aprende, qué estrategias funcionan y cuáles no
- "Presentaciones de aprendizaje": Instancias donde estudiantes comparten evidencias ante familias
`,
};

/**
 * Build area-specific evaluation prompt
 */
function buildEvaluationPrompt(area: 'personalizacion' | 'aprendizaje' | 'evaluacion'): string {
  const areaLabels: Record<string, string> = {
    personalizacion: 'Personalización',
    aprendizaje: 'Aprendizaje',
    evaluacion: 'Evaluación',
  };
  const areaLabel = areaLabels[area] || area;
  const areaFocus = AREA_FOCUS[area];

  return `Eres un experto en evaluación educativa especializado en transformación escolar en Chile.

Tu tarea es evaluar las respuestas de una comunidad educativa sobre su nivel de transformación en la vía de ${areaLabel}.
${areaFocus}

## CONTEXTO EDUCATIVO CHILENO

**Terminología general:**
- "Generación Tractor (GT)": Los primeros cursos donde la escuela decide enfocar la transformación educativa de manera radical y rápida. Típicamente Pre-Kinder a 2º Básico, pero puede extenderse hasta 4º Básico. Cada año se agrega un nuevo curso a GT. La velocidad varía por escuela.
- "Generación Innova (GI)": Todos los cursos que NO son GT. La transformación es planificada e intencional, pero más lenta y medida.
- "Curso": Equivalente a un grado o año escolar (ej: 5º básico)

**Criterios numéricos para COBERTURA:**
- Nivel 1: Menos de 50 estudiantes o 1-2 cursos aislados (piloto inicial)
- Nivel 2: 50-200 estudiantes, o implementación en varios cursos de un nivel (ej: todo 5º y 6º básico)
- Nivel 3: Más de 200 estudiantes o implementación en la mayoría de niveles educativos
- Nivel 4: Toda la matrícula institucional de manera articulada y sistemática

**Criterios para FRECUENCIA:**
- Nivel 1: Una vez al año o esporádico
- Nivel 2: 2 veces al año (semestral)
- Nivel 3: Trimestral, bimestral o mensual
- Nivel 4: Sistemático e integrado en la vida escolar (semanal/continuo)

**Al evaluar:**
1. Busca evidencia numérica específica (cantidad de estudiantes, cursos, frecuencia temporal)
2. Si el equipo menciona números concretos, úsalos para determinar el nivel según los criterios arriba
3. No seas excesivamente conservador - si la evidencia claramente apunta a Nivel 2-3, asígnalo
4. Valora la sistematización y el impacto, no solo la cantidad
5. Ejemplo: "160 estudiantes en 5º y 6º básico" = Nivel 2 (implementación significativa en varios cursos)

## Niveles de Desempeño

Para cada dimensión, determina el nivel basándote en estos criterios:

**Nivel 1 - Incipiente:**
- Conciencia inicial del tema
- Intentos esporádicos o aislados
- Sin sistematización
- Impacto mínimo o no medible

**Nivel 2 - Emergente:**
- Prácticas sistemáticas comenzando
- Implementación en algunas áreas o con algunos estudiantes
- Resultados iniciales visibles
- Requiere acompañamiento constante

**Nivel 3 - Avanzado:**
- Implementación consistente y generalizada
- Resultados medibles y positivos
- Prácticas institucionalizadas
- Autonomía en la ejecución

**Nivel 4 - Consolidado:**
- Excelencia sostenida en el tiempo
- Impacto transformador evidente
- Innovación continua
- Modelo para otros

## Instrucciones

1. Lee cada respuesta cuidadosamente
2. Compara la evidencia con los descriptores de nivel de la rúbrica
3. Identifica citas específicas que justifiquen el nivel
4. Determina el nivel más apropiado (1-4)
5. Proporciona pasos concretos de mejora

## Formato de Salida

Responde ÚNICAMENTE con un objeto JSON válido siguiendo esta estructura exacta:

{
  "dimension_evaluations": [
    {
      "rubricItemId": "uuid-del-item",
      "dimension": "nombre de la dimensión",
      "level": 2,
      "reasoning": "Justificación clara del nivel asignado",
      "evidence_quote": "Cita textual de la respuesta que justifica el nivel",
      "next_steps": [
        "Paso concreto 1 para mejorar",
        "Paso concreto 2 para mejorar"
      ]
    }
  ],
  "overall_stage": 2,
  "overall_stage_label": "Emergente",
  "strengths": [
    "Fortaleza identificada 1",
    "Fortaleza identificada 2",
    "Fortaleza identificada 3"
  ],
  "growth_areas": [
    "Área de crecimiento 1",
    "Área de crecimiento 2",
    "Área de crecimiento 3"
  ],
  "summary": "Resumen ejecutivo del estado general de transformación en 2-3 oraciones",
  "recommendations": [
    "Recomendación prioritaria 1",
    "Recomendación prioritaria 2",
    "Recomendación prioritaria 3"
  ]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional antes o después.`;
}

// Keep old const for backward compatibility (defaults to Personalización)
const EVALUATION_PROMPT = buildEvaluationPrompt('personalizacion');

/**
 * Build area-specific objective evaluation prompt (simplified, no overall summary)
 */
function buildObjectiveEvaluationPrompt(area: 'personalizacion' | 'aprendizaje' | 'evaluacion'): string {
  const areaLabels: Record<string, string> = {
    personalizacion: 'Personalización',
    aprendizaje: 'Aprendizaje',
    evaluacion: 'Evaluación',
  };
  const areaLabel = areaLabels[area] || area;
  const areaFocus = AREA_FOCUS[area];

  return `Eres un experto en evaluación educativa especializado en transformación escolar en Chile.

Tu tarea es evaluar las respuestas de una comunidad educativa para UN SOLO OBJETIVO de la vía de ${areaLabel}.
${areaFocus}

## CONTEXTO EDUCATIVO CHILENO

**Terminología importante:**
- "Generación Tractor (GT)": Los primeros cursos donde la escuela decide enfocar la transformación educativa de manera radical y rápida. Típicamente Pre-Kinder a 2º Básico, pero puede extenderse hasta 4º Básico. Cada año se agrega un nuevo curso a GT. La velocidad varía por escuela.
- "Generación Innova (GI)": Todos los cursos que NO son GT. La transformación es planificada e intencional, pero más lenta y medida.
- "Curso": Equivalente a un grado o año escolar (ej: 5º básico)

**Criterios numéricos para COBERTURA:**
- Nivel 1: Menos de 50 estudiantes o 1-2 cursos aislados (piloto inicial)
- Nivel 2: 50-200 estudiantes, o implementación en varios cursos de un nivel (ej: todo 5º y 6º básico)
- Nivel 3: Más de 200 estudiantes o implementación en la mayoría de niveles educativos
- Nivel 4: Toda la matrícula institucional de manera articulada y sistemática

**Criterios para FRECUENCIA:**
- Nivel 1: Una vez al año o esporádico
- Nivel 2: 2 veces al año (semestral)
- Nivel 3: Trimestral, bimestral o mensual
- Nivel 4: Sistemático e integrado en la vida escolar (semanal/continuo)

**Al evaluar:**
1. Busca evidencia numérica específica (cantidad de estudiantes, cursos, frecuencia temporal)
2. Si el equipo menciona números concretos, úsalos para determinar el nivel según los criterios arriba
3. No seas excesivamente conservador - si la evidencia claramente apunta a Nivel 2-3, asígnalo
4. Valora la sistematización y el impacto, no solo la cantidad
5. Ejemplo: "160 estudiantes en 5º y 6º básico" = Nivel 2 (implementación significativa en varios cursos)

## Niveles de Desempeño

Para cada dimensión, determina el nivel basándote en estos criterios:

**Nivel 1 - Incipiente:**
- Conciencia inicial del tema
- Intentos esporádicos o aislados
- Sin sistematización
- Impacto mínimo o no medible

**Nivel 2 - Emergente:**
- Prácticas sistemáticas comenzando
- Implementación en algunas áreas o con algunos estudiantes
- Resultados iniciales visibles
- Requiere acompañamiento constante

**Nivel 3 - Avanzado:**
- Implementación consistente y generalizada
- Resultados medibles y positivos
- Prácticas institucionalizadas
- Autonomía en la ejecución

**Nivel 4 - Consolidado:**
- Excelencia sostenida en el tiempo
- Impacto transformador evidente
- Innovación continua
- Modelo para otros

## Instrucciones

1. Lee cada respuesta cuidadosamente
2. Compara la evidencia con los descriptores de nivel de la rúbrica
3. Identifica citas específicas que justifiquen el nivel
4. Determina el nivel más apropiado (1-4)
5. Proporciona pasos concretos de mejora

## Formato de Salida

Responde ÚNICAMENTE con un objeto JSON válido siguiendo esta estructura exacta:

{
  "dimension_evaluations": [
    {
      "rubricItemId": "uuid-del-item",
      "dimension": "nombre de la dimensión",
      "level": 2,
      "reasoning": "Justificación clara del nivel asignado",
      "evidence_quote": "Cita textual de la respuesta que justifica el nivel",
      "next_steps": [
        "Paso concreto 1 para mejorar",
        "Paso concreto 2 para mejorar"
      ]
    }
  ]
}

IMPORTANTE:
- Responde SOLO con el JSON, sin texto adicional antes o después
- DEBES escapar correctamente las comillas dobles dentro de los valores de texto usando \"
- Ejemplo: "evidence_quote": "El docente dijo \\"esto es importante\\" en su respuesta"`;
}

// Keep old const for backward compatibility
const OBJECTIVE_EVALUATION_PROMPT = buildObjectiveEvaluationPrompt('personalizacion');

/**
 * Build area-specific summary prompt for objective-by-objective evaluation
 */
function buildSummaryPrompt(area: 'personalizacion' | 'aprendizaje' | 'evaluacion', dimensionEvaluations: any[]): string {
  const areaLabels: Record<string, string> = {
    personalizacion: 'Personalización',
    aprendizaje: 'Aprendizaje',
    evaluacion: 'Evaluación',
  };
  const areaLabel = areaLabels[area] || area;

  return `Eres un experto en evaluación educativa especializado en transformación escolar en Chile.

Has evaluado las respuestas de una comunidad educativa sobre su nivel de transformación en la vía de ${areaLabel}.

A continuación se presentan las evaluaciones detalladas de cada dimensión que ya has realizado.

Tu tarea ahora es generar un resumen ejecutivo que incluya:
1. Nivel general de transformación (1-4)
2. Fortalezas principales (3-5 puntos)
3. Áreas de crecimiento (3-5 puntos)
4. Resumen ejecutivo (2-3 oraciones)
5. Recomendaciones prioritarias (3-5 puntos)

## EVALUACIONES POR DIMENSIÓN

${dimensionEvaluations.map((dimEval, idx) => `
**Dimensión ${idx + 1}: ${dimEval.dimension}**
- Nivel asignado: ${dimEval.level}
- Justificación: ${dimEval.reasoning}
- Evidencia: "${dimEval.evidence_quote}"
`).join('\n')}

## CRITERIOS PARA NIVEL GENERAL

El nivel general debe reflejar el promedio ponderado de todas las dimensiones, considerando:
- **Nivel 1 - Incipiente**: Promedio 1.0-1.5 - Conciencia inicial, intentos aislados
- **Nivel 2 - Emergente**: Promedio 1.6-2.5 - Prácticas comenzando, resultados iniciales
- **Nivel 3 - Avanzado**: Promedio 2.6-3.5 - Implementación generalizada, prácticas institucionalizadas
- **Nivel 4 - Consolidado**: Promedio 3.6-4.0 - Excelencia sostenida, innovación continua

## FORMATO DE SALIDA

Responde ÚNICAMENTE con un objeto JSON válido siguiendo esta estructura exacta:

{
  "overall_stage": 2,
  "overall_stage_label": "Emergente",
  "strengths": [
    "Fortaleza identificada 1",
    "Fortaleza identificada 2",
    "Fortaleza identificada 3"
  ],
  "growth_areas": [
    "Área de crecimiento 1",
    "Área de crecimiento 2",
    "Área de crecimiento 3"
  ],
  "summary": "Resumen ejecutivo del estado general de transformación en 2-3 oraciones completas y coherentes.",
  "recommendations": [
    "Recomendación prioritaria 1",
    "Recomendación prioritaria 2",
    "Recomendación prioritaria 3"
  ]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional antes o después.`;
}

export class RubricEvaluator {
  private anthropic: Anthropic;
  private area: 'personalizacion' | 'aprendizaje' | 'evaluacion';
  private modelId: string;

  constructor(
    apiKey: string,
    area: 'personalizacion' | 'aprendizaje' | 'evaluacion' = 'personalizacion',
    modelId?: string
  ) {
    console.log('🔧 RubricEvaluator constructor called');
    console.log('📊 API key length:', apiKey.length);
    console.log('🎯 Área:', area);

    this.area = area;
    // Use provided modelId, or fall back to env var, or default to Sonnet 4
    this.modelId = modelId || process.env.ANTHROPIC_MODEL_ID || 'claude-sonnet-4-6';
    console.log('🤖 Model ID:', this.modelId);

    try {
      this.anthropic = new Anthropic({
        apiKey,
      });
      console.log('✅ Anthropic client initialized successfully');
    } catch (err: any) {
      console.error('❌ Error initializing Anthropic client:', err);
      throw err;
    }

    console.log('✅ RubricEvaluator constructor complete');
  }

  /**
   * Sanitize Claude's JSON response to fix common formatting issues
   * Specifically handles unescaped quotes in string values that cause parse errors
   */
  private sanitizeClaudeJSON(jsonText: string): string {
    try {
      // Strategy: Use a lenient JSON repair approach
      // 1. Try to parse as-is first
      try {
        JSON.parse(jsonText);
        return jsonText; // Already valid JSON
      } catch (e) {
        // Continue to repair attempts
      }

      // 2. Common issue: Unescaped quotes within string values
      // Replace problematic patterns in string contexts
      // This is a heuristic approach - we look for patterns like:
      // "evidence_quote": "text with "unescaped" quotes"

      let sanitized = jsonText;

      // Find all string values and escape internal quotes
      // Match pattern: "key": "value with potential "internal quotes" here"
      // We need to be careful not to break valid JSON structure

      // More robust approach: Parse character by character, tracking context
      let result = '';
      let inString = false;
      let inKey = false;
      let afterColon = false;
      let braceDepth = 0;
      let escapeNext = false;

      for (let i = 0; i < sanitized.length; i++) {
        const char = sanitized[i];
        const prevChar = i > 0 ? sanitized[i - 1] : '';
        const nextChar = i < sanitized.length - 1 ? sanitized[i + 1] : '';

        // Handle escape sequences
        if (escapeNext) {
          result += char;
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          result += char;
          escapeNext = true;
          continue;
        }

        // Track JSON structure depth
        if (!inString) {
          if (char === '{' || char === '[') braceDepth++;
          if (char === '}' || char === ']') braceDepth--;
        }

        // Handle quote characters
        if (char === '"') {
          if (!inString) {
            // Starting a new string
            inString = true;
            inKey = !afterColon; // If we haven't seen a colon yet, this is a key
            result += char;
          } else {
            // Potentially ending a string
            // Check if this is actually the end or a quote inside the value
            // Heuristic: Look ahead for comma, close brace/bracket, or colon
            const lookAhead = sanitized.substring(i + 1, i + 10).trim();
            const isRealEnd = lookAhead.startsWith(',') ||
                             lookAhead.startsWith('}') ||
                             lookAhead.startsWith(']') ||
                             lookAhead.startsWith(':');

            if (isRealEnd || inKey) {
              // This is the actual end of the string
              inString = false;
              if (inKey) afterColon = false;
              result += char;
            } else {
              // This is an internal quote that should be escaped
              result += '\\"';
            }
          }
        } else {
          result += char;
          if (char === ':' && !inString) {
            afterColon = true;
          }
          if (char === ',' && !inString) {
            afterColon = false;
            inKey = false;
          }
        }
      }

      console.log('🔧 JSON sanitization applied');
      return result;

    } catch (sanitizeError) {
      console.warn('⚠️ JSON sanitization failed, returning original:', sanitizeError);
      return jsonText; // Return original if sanitization fails
    }
  }

  /**
   * Extract contextual _accion responses (open-ended qualitative answers)
   * These don't map to rubric items but provide valuable context for evaluation
   *
   * Note: Only works with semantic keys (objetivo1_accion1_accion format).
   * UUID-format keys don't have _accion responses - they use rubric IDs directly.
   */
  private extractAccionResponses(
    responses: Record<string, DimensionResponse>
  ): Record<string, { objectiveNum: number; actionNum: number; text: string }> {
    const accionResponses: Record<string, { objectiveNum: number; actionNum: number; text: string }> = {};

    // Early return if responses are in UUID format (no _accion keys possible)
    const firstKey = Object.keys(responses)[0];
    if (!firstKey) {
      console.log('📝 No responses to extract _accion from');
      return accionResponses;
    }

    // UUID keys have 4+ hyphens, semantic keys have 0-2
    const hyphenCount = (firstKey.match(/-/g) || []).length;
    if (hyphenCount >= 4) {
      console.log('📝 Responses are in UUID format - no _accion keys to extract');
      return accionResponses;
    }

    for (const [key, response] of Object.entries(responses)) {
      if (key.endsWith('_accion')) {
        const match = key.match(/objetivo(\d+)_accion(\d+)_accion/);
        if (match) {
          const text = response.response || response.answer || '';
          if (text.trim()) {
            accionResponses[key] = {
              objectiveNum: parseInt(match[1]),
              actionNum: parseInt(match[2]),
              text: text.trim()
            };
          }
        } else {
          // Key ends with _accion but doesn't match expected pattern - log for debugging
          console.warn(`⚠️ Unexpected _accion key format: ${key}`);
        }
      }
    }

    console.log(`📝 Extracted ${Object.keys(accionResponses).length} contextual _accion responses`);
    return accionResponses;
  }

  /**
   * Map semantic keys to rubric item UUIDs
   */
  private mapResponsesToRubricItems(
    rubricItems: RubricItem[],
    responses: Record<string, DimensionResponse>
  ): Record<string, DimensionResponse> {
    console.log('🗺️ mapResponsesToRubricItems called');
    console.log('📊 Rubric items count:', rubricItems.length);
    console.log('📊 Responses count:', Object.keys(responses).length);

    const mappedResponses: Record<string, DimensionResponse> = {};

    // Check if responses are already in UUID format
    const firstKey = Object.keys(responses)[0];
    if (!firstKey) {
      console.log('⚠️ No responses to map');
      return responses;
    }

    console.log('🔍 Evaluator: First key format:', firstKey);

    // UUIDs have 4-5 hyphens, semantic keys have 0-2
    // UUID example: a6bed0f2-cf31-4bfd-b1a3-299965de7359 (4 hyphens)
    // Semantic examples: obj1-accion (1 hyphen), objetivo1_accion1_accion (0 hyphens)
    const hyphenCount = (firstKey.match(/-/g) || []).length;
    const isUUID = hyphenCount >= 4;

    console.log('🔍 Evaluator: Hyphen count:', hyphenCount);
    console.log('🔍 Evaluator: Detected as UUID?', isUUID);

    if (isUUID) {
      console.log('✅ Keys are already in UUID format');
      return responses; // Already in correct format
    }

    // Otherwise, map semantic keys to UUID keys
    console.log('🔄 Converting semantic keys to UUID keys...');

    let successCount = 0;
    let accionCount = 0;

    for (const [semanticKey, response] of Object.entries(responses)) {
      // Parse semantic key: "objetivo1_accion1_accion" or "objetivo1_accion1_cobertura"
      const match = semanticKey.match(/objetivo(\d+)_accion(\d+)_(\w+)/);

      if (!match) {
        console.warn(`⚠️ Key doesn't match pattern: ${semanticKey}`);
        continue;
      }

      const [, objectiveNum, actionNum, dimensionType] = match;

      // Skip _accion responses - they're contextual, not rubric-mapped
      // They'll be extracted separately via extractAccionResponses()
      if (dimensionType === 'accion') {
        accionCount++;
        continue; // Don't try to map to rubric - these are qualitative context
      }

      // Find matching rubric item for dimension responses
      const rubricItem = rubricItems.find(item =>
        item.objective_number === parseInt(objectiveNum) &&
        item.action_number === parseInt(actionNum) &&
        item.dimension === dimensionType
      );

      if (rubricItem) {
        // Normalize the response format
        mappedResponses[rubricItem.id] = {
          rubricItemId: rubricItem.id,
          response: response.response || response.answer || '',
          suggestedLevel: response.suggestedLevel ??
                         (response.level ? this.parseLevelToNumber(response.level) : null),
          confirmedLevel: response.confirmedLevel ??
                         (response.level ? this.parseLevelToNumber(response.level) : null),
          lastUpdated: response.lastUpdated || response.timestamp || new Date().toISOString()
        };

        successCount++;
      } else {
        console.warn(`⚠️ No rubric item found for dimension: obj${objectiveNum}, act${actionNum}, ${dimensionType}`);
      }
    }

    console.log(`✅ Mapping complete: ${successCount} dimension responses mapped, ${accionCount} contextual _accion responses (handled separately)`);

    return mappedResponses;
  }

  /**
   * Parse level string to number
   */
  private parseLevelToNumber(level: string | number): number {
    if (typeof level === 'number') return level;

    const levelMap: Record<string, number> = {
      'incipiente': 1,
      'en_desarrollo': 2,
      'emergente': 2,  // Alternative name
      'avanzado': 3,
      'consolidado': 4
    };

    return levelMap[level.toLowerCase()] || 1;
  }

  /**
   * Evaluate all responses against the rubric using Claude Sonnet 4.5
   */
  async evaluateAssessment(
    responses: Record<string, DimensionResponse>,
    rubricItems: RubricItem[]
  ): Promise<AssessmentEvaluation> {
    console.log('🤖 evaluateAssessment called');
    console.log('📊 Input responses:', Object.keys(responses).length);
    console.log('📊 Input rubric items:', rubricItems.length);

    // Extract contextual _accion responses (qualitative data not in rubric)
    console.log('✅ Extracting contextual _accion responses...');
    const accionResponses = this.extractAccionResponses(responses);

    // Map semantic keys to rubric UUIDs if needed
    console.log('✅ Mapping responses to rubric items...');
    const mappedResponses = this.mapResponsesToRubricItems(rubricItems, responses);
    console.log('✅ Mapped responses count:', Object.keys(mappedResponses).length);

    // Build evaluation context (including _accion context)
    console.log('✅ Building evaluation context...');
    const evaluationContext = this.buildEvaluationContext(mappedResponses, rubricItems, accionResponses);
    console.log('✅ Context built. Length:', evaluationContext.length, 'characters');

    // Check if context is too large
    if (evaluationContext.length > 150000) {
      console.warn('⚠️ WARNING: Context might be too large!', evaluationContext.length, 'characters');
    }

    // Combine prompt and context (use área-specific prompt)
    const areaPrompt = buildEvaluationPrompt(this.area);
    const fullPrompt = `${areaPrompt}\n\n${evaluationContext}`;
    console.log('📏 Full prompt length:', fullPrompt.length, 'characters');

    // 🔍 DIAGNOSTIC: Log the first 5000 characters of the prompt to see what Claude receives
    console.log('🔍 DIAGNOSTIC: First 5000 chars of prompt sent to Claude:');
    console.log(fullPrompt.substring(0, 5000));
    console.log('...[truncated]');

    // Call Claude API
    console.log('✅ Calling Anthropic API...');
    console.log('📋 Using model:', this.modelId);
    console.log('📋 Max tokens: 16000');
    console.log('📋 Temperature: 0.3');

    let message;
    try {
      message = await this.anthropic.messages.create({
        model: this.modelId,
        max_tokens: 16000, // Increased to handle full 33-dimension evaluation JSON
        temperature: 0.3, // Lower temperature for more consistent evaluations
        messages: [
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
      });
      console.log('✅ API call successful');
      console.log('📊 Response usage:', {
        inputTokens: message.usage?.input_tokens || 0,
        outputTokens: message.usage?.output_tokens || 0
      });
    } catch (apiError: any) {
      console.error('❌ ANTHROPIC API ERROR - FULL DETAILS:');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error type:', apiError.constructor?.name || 'Unknown');
      console.error('Error message:', apiError.message);
      console.error('Error stack:', apiError.stack);

      if (apiError.status) {
        console.error('HTTP status:', apiError.status);
      }

      if (apiError.error) {
        console.error('API error object:', JSON.stringify(apiError.error, null, 2));
      }

      if (apiError.type) {
        console.error('Error type field:', apiError.type);
      }

      if (apiError.response) {
        console.error('Response data:', apiError.response);
      }

      if (apiError.headers) {
        console.error('Response headers:', apiError.headers);
      }

      console.error('Full error object keys:', Object.keys(apiError));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Throw error with all details
      throw new Error(
        `Error en llamada a Anthropic API: ${apiError.message || 'Unknown error'}. ` +
        `Status: ${apiError.status || 'N/A'}. ` +
        `Type: ${apiError.type || 'N/A'}. ` +
        `Details: ${JSON.stringify(apiError.error || {})}`
      );
    }

    // Extract JSON from response
    console.log('✅ Extracting JSON from response...');
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('📊 Response text length:', responseText.length);

    // Strip markdown code blocks if present
    let jsonText = responseText.trim();

    // Check if wrapped in ```json ... ```
    if (jsonText.startsWith('```json')) {
      console.log('🔧 Removing markdown code block markers (```json)...');
      // Remove ```json from start (including newline)
      jsonText = jsonText.substring(7).trim();

      // Remove ``` from end
      const lastBacktickIndex = jsonText.lastIndexOf('```');
      if (lastBacktickIndex !== -1) {
        jsonText = jsonText.substring(0, lastBacktickIndex);
      }

      jsonText = jsonText.trim();
      console.log('✅ Markdown removed. New length:', jsonText.length);
    } else if (jsonText.startsWith('```')) {
      console.log('🔧 Removing generic code block markers (```)...');
      // Handle ``` without "json"
      jsonText = jsonText.substring(3).trim();
      const lastBacktickIndex = jsonText.lastIndexOf('```');
      if (lastBacktickIndex !== -1) {
        jsonText = jsonText.substring(0, lastBacktickIndex);
      }
      jsonText = jsonText.trim();
      console.log('✅ Markdown removed. New length:', jsonText.length);
    }

    try {
      console.log('✅ Parsing JSON...');
      console.log('📊 First 100 chars of cleaned JSON:', jsonText.substring(0, 100));
      const evaluation = JSON.parse(jsonText) as AssessmentEvaluation;
      console.log('✅ JSON parsed successfully');

      // Validate evaluation structure
      console.log('✅ Validating evaluation structure...');
      if (!this.isValidEvaluation(evaluation)) {
        console.error('❌ Invalid evaluation structure');
        console.error('Evaluation object keys:', Object.keys(evaluation));
        console.error('Evaluation object:', JSON.stringify(evaluation, null, 2).substring(0, 1000));
        throw new Error('Invalid evaluation structure returned by AI');
      }

      console.log('✅ Evaluation valid');
      console.log('📊 Evaluation summary:', {
        overallStage: evaluation.overall_stage,
        dimensionCount: evaluation.dimension_evaluations?.length || 0,
        strengthsCount: evaluation.strengths?.length || 0,
        growthAreasCount: evaluation.growth_areas?.length || 0
      });

      return evaluation;
    } catch (error: any) {
      console.error('❌ JSON PARSING ERROR - FULL DETAILS:');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error type:', error.constructor?.name || 'Unknown');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Original response length:', responseText.length);
      console.error('Cleaned JSON length:', jsonText.length);
      console.error('Cleaned JSON (first 1000 chars):', jsonText.substring(0, 1000));
      console.error('Cleaned JSON (last 500 chars):', jsonText.substring(Math.max(0, jsonText.length - 500)));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Try to determine if it's a JSON parse error or validation error
      if (error instanceof SyntaxError) {
        throw new Error(
          `Error al parsear respuesta JSON del AI: ${error.message}. ` +
          `La respuesta no es JSON válido. Primeros 200 caracteres: ${jsonText.substring(0, 200)}`
        );
      } else {
        throw new Error(
          `Error al procesar evaluación del AI: ${error.message}. ` +
          `La estructura de la respuesta no es válida.`
        );
      }
    }
  }

  /**
   * Evaluate a single objective's responses
   * This is used for progressive evaluation to avoid timeouts
   */
  async evaluateObjective(
    objectiveNumber: number,
    responses: Record<string, DimensionResponse>,
    rubricItems: RubricItem[]
  ): Promise<{ dimension_evaluations: DimensionEvaluation[] }> {
    console.log(`🎯 evaluateObjective called for Objective ${objectiveNumber}`);
    console.log('📊 Input responses:', Object.keys(responses).length);
    console.log('📊 Input rubric items:', rubricItems.length);

    // Filter rubric items to only this objective
    const objectiveItems = rubricItems.filter(
      item => item.objective_number === objectiveNumber
    );
    console.log(`📊 Filtered to ${objectiveItems.length} items for Objective ${objectiveNumber}`);

    if (objectiveItems.length === 0) {
      throw new Error(`No rubric items found for Objective ${objectiveNumber}`);
    }

    // Map semantic keys to rubric UUIDs if needed
    console.log('✅ Mapping responses to rubric items...');
    const mappedResponses = this.mapResponsesToRubricItems(objectiveItems, responses);
    console.log('✅ Mapped responses count:', Object.keys(mappedResponses).length);

    // Build evaluation context for this objective only
    console.log('✅ Building evaluation context for objective...');
    const evaluationContext = this.buildEvaluationContext(mappedResponses, objectiveItems);
    console.log('✅ Context built. Length:', evaluationContext.length, 'characters');

    // Combine prompt and context (using simpler objective-level prompt with área)
    const areaPrompt = buildObjectiveEvaluationPrompt(this.area);
    const fullPrompt = `${areaPrompt}\n\n${evaluationContext}`;
    console.log('📏 Full prompt length:', fullPrompt.length, 'characters');

    // Call Claude API
    console.log('✅ Calling Anthropic API for objective evaluation...');
    console.log('📋 Using model:', this.modelId);
    console.log('📋 Max tokens: 8000'); // Increased to handle detailed evidence_quote fields
    console.log('📋 Temperature: 0.3');

    let message;
    try {
      message = await this.anthropic.messages.create({
        model: this.modelId,
        max_tokens: 8000, // Increased from 4000 to prevent truncation
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
      });
      console.log('✅ API call successful');
      console.log('📊 Response usage:', {
        inputTokens: message.usage?.input_tokens || 0,
        outputTokens: message.usage?.output_tokens || 0
      });
      console.log('📊 Stop reason:', message.stop_reason);

      // CRITICAL: Check if response was truncated due to token limit
      if (message.stop_reason === 'max_tokens') {
        console.error('❌ RESPONSE TRUNCATED: Hit max_tokens limit');
        console.error('📊 Token usage:', message.usage);
        throw new Error(
          `La respuesta del AI fue truncada por límite de tokens. ` +
          `Objetivo ${objectiveNumber} requiere más tokens para completar la evaluación. ` +
          `Por favor, contacte al administrador del sistema.`
        );
      }
    } catch (apiError: any) {
      console.error('❌ ANTHROPIC API ERROR in evaluateObjective:');
      console.error('Error message:', apiError.message);
      throw new Error(
        `Error en llamada a Anthropic API para Objetivo ${objectiveNumber}: ${apiError.message || 'Unknown error'}`
      );
    }

    // Extract JSON from response
    console.log('✅ Extracting JSON from response...');
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('📊 Response text length:', responseText.length);

    // Strip markdown code blocks if present
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.substring(7).trim();
      const lastBacktickIndex = jsonText.lastIndexOf('```');
      if (lastBacktickIndex !== -1) {
        jsonText = jsonText.substring(0, lastBacktickIndex);
      }
      jsonText = jsonText.trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.substring(3).trim();
      const lastBacktickIndex = jsonText.lastIndexOf('```');
      if (lastBacktickIndex !== -1) {
        jsonText = jsonText.substring(0, lastBacktickIndex);
      }
      jsonText = jsonText.trim();
    }

    // Validate JSON completeness before sanitization
    // Check for basic JSON structure completeness
    const jsonTrimmed = jsonText.trim();
    const startsWithBrace = jsonTrimmed.startsWith('{');
    const endsWithBrace = jsonTrimmed.endsWith('}');

    if (!startsWithBrace || !endsWithBrace) {
      console.error('❌ JSON appears truncated or malformed');
      console.error('Starts with {:', startsWithBrace);
      console.error('Ends with }:', endsWithBrace);
      console.error('Last 100 chars:', jsonTrimmed.slice(-100));
      throw new Error(
        `Respuesta JSON incompleta del AI (truncada o malformada). ` +
        `Esto puede indicar que el límite de tokens fue alcanzado durante la generación.`
      );
    }

    // Sanitize JSON to fix common issues from Claude responses
    // Specifically: unescaped quotes in string values
    console.log('✅ Sanitizing JSON response...');
    jsonText = this.sanitizeClaudeJSON(jsonText);

    try {
      console.log('✅ Parsing JSON...');
      const evaluation = JSON.parse(jsonText) as { dimension_evaluations: DimensionEvaluation[] };
      console.log('✅ JSON parsed successfully');

      // Validate structure
      if (!evaluation.dimension_evaluations || !Array.isArray(evaluation.dimension_evaluations)) {
        throw new Error('Invalid objective evaluation structure: missing dimension_evaluations array');
      }

      console.log('✅ Objective evaluation valid');
      console.log('📊 Dimension evaluations count:', evaluation.dimension_evaluations.length);

      return evaluation;
    } catch (error: any) {
      console.error('❌ JSON PARSING ERROR in evaluateObjective:');
      console.error('Error message:', error.message);
      console.error('Cleaned JSON (first 1000 chars):', jsonText.substring(0, 1000));
      throw new Error(
        `Error al parsear respuesta JSON del AI para Objetivo ${objectiveNumber}: ${error.message}`
      );
    }
  }

  /**
   * Generate overall summary from all objective evaluations
   * This is called after all objectives have been evaluated individually
   */
  async generateOverallSummary(
    objectiveEvaluations: Record<number, { dimension_evaluations: DimensionEvaluation[] }>
  ): Promise<{
    overall_stage: number;
    overall_stage_label: 'Incipiente' | 'Emergente' | 'Avanzado' | 'Consolidado';
    strengths: string[];
    growth_areas: string[];
    summary: string;
    recommendations: string[];
  }> {
    console.log('📊 generateOverallSummary called');
    console.log('📊 Objective evaluations count:', Object.keys(objectiveEvaluations).length);

    // Collect all dimension evaluations
    const allDimensionEvaluations: DimensionEvaluation[] = [];
    for (const objNum of Object.keys(objectiveEvaluations).sort()) {
      const objEval = objectiveEvaluations[parseInt(objNum)];
      if (objEval?.dimension_evaluations) {
        allDimensionEvaluations.push(...objEval.dimension_evaluations);
      }
    }

    console.log('📊 Total dimension evaluations:', allDimensionEvaluations.length);

    // Build summary prompt (use área-specific builder)
    const summaryPrompt = buildSummaryPrompt(this.area, allDimensionEvaluations);

    // Call Claude API
    console.log('✅ Calling Anthropic API for overall summary...');
    console.log('📋 Using model:', this.modelId);
    console.log('📋 Max tokens: 2000');
    console.log('📋 Temperature: 0.3');

    let message;
    try {
      message = await this.anthropic.messages.create({
        model: this.modelId,
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: summaryPrompt,
          },
        ],
      });
      console.log('✅ API call successful');
      console.log('📊 Response usage:', {
        inputTokens: message.usage?.input_tokens || 0,
        outputTokens: message.usage?.output_tokens || 0
      });
    } catch (apiError: any) {
      console.error('❌ ANTHROPIC API ERROR in generateOverallSummary:');
      console.error('Error message:', apiError.message);
      throw new Error(
        `Error en llamada a Anthropic API para resumen general: ${apiError.message || 'Unknown error'}`
      );
    }

    // Extract JSON from response
    console.log('✅ Extracting JSON from response...');
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('📊 Response text length:', responseText.length);

    // Strip markdown code blocks if present
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.substring(7).trim();
      const lastBacktickIndex = jsonText.lastIndexOf('```');
      if (lastBacktickIndex !== -1) {
        jsonText = jsonText.substring(0, lastBacktickIndex);
      }
      jsonText = jsonText.trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.substring(3).trim();
      const lastBacktickIndex = jsonText.lastIndexOf('```');
      if (lastBacktickIndex !== -1) {
        jsonText = jsonText.substring(0, lastBacktickIndex);
      }
      jsonText = jsonText.trim();
    }

    try {
      console.log('✅ Parsing JSON...');
      const summary = JSON.parse(jsonText);
      console.log('✅ JSON parsed successfully');

      // Validate structure
      if (!summary.overall_stage || !summary.overall_stage_label ||
          !Array.isArray(summary.strengths) || !Array.isArray(summary.growth_areas) ||
          !summary.summary || !Array.isArray(summary.recommendations)) {
        throw new Error('Invalid summary structure');
      }

      console.log('✅ Overall summary valid');
      console.log('📊 Overall stage:', summary.overall_stage, '-', summary.overall_stage_label);

      return summary;
    } catch (error: any) {
      console.error('❌ JSON PARSING ERROR in generateOverallSummary:');
      console.error('Error message:', error.message);
      console.error('Cleaned JSON (first 1000 chars):', jsonText.substring(0, 1000));
      throw new Error(
        `Error al parsear respuesta JSON del resumen general: ${error.message}`
      );
    }
  }

  /**
   * Build the evaluation context with responses and rubric
   */
  private buildEvaluationContext(
    responses: Record<string, DimensionResponse>,
    rubricItems: RubricItem[],
    accionResponses?: Record<string, { objectiveNum: number; actionNum: number; text: string }>
  ): string {
    let context = '## RESPUESTAS DE LA COMUNIDAD EDUCATIVA\n\n';

    // Group by objective and action
    const grouped = this.groupRubricItems(rubricItems);

    for (const objective of grouped) {
      context += `### Objetivo ${objective.objectiveNumber}: ${objective.objectiveText}\n\n`;

      for (const action of objective.actions) {
        context += `#### Acción ${action.actionNumber}: ${action.actionText}\n\n`;

        // Add contextual description from _accion response if available
        // This provides qualitative context about how the school implements this action
        if (accionResponses) {
          const accionKey = `objetivo${objective.objectiveNumber}_accion${action.actionNumber}_accion`;
          const accionData = accionResponses[accionKey];
          if (accionData && accionData.text) {
            context += `**Contexto del equipo sobre esta acción:**\n"${accionData.text}"\n\n`;
          }
        }

        // Add each dimension response
        for (const [dimensionType, rubricItem] of Object.entries(action.dimensions)) {
          const item = rubricItem as RubricItem;  // Type assertion
          const response = responses[item.id];

          context += `**Dimensión: ${this.getDimensionLabel(dimensionType as any)}**\n`;
          context += `Rubric Item ID: ${item.id}\n\n`;

          context += `Descriptores de nivel:\n`;
          context += `- Nivel 1: ${item.level_1_descriptor}\n`;
          context += `- Nivel 2: ${item.level_2_descriptor}\n`;
          context += `- Nivel 3: ${item.level_3_descriptor}\n`;
          context += `- Nivel 4: ${item.level_4_descriptor}\n\n`;

          if (response && response.response && response.response.trim()) {
            context += `Respuesta del equipo:\n"${response.response}"\n\n`;
          } else {
            context += `Respuesta del equipo: (Sin respuesta)\n\n`;
          }

          context += '---\n\n';
        }
      }
    }

    return context;
  }

  /**
   * Group rubric items by objective and action
   */
  private groupRubricItems(rubricItems: RubricItem[]) {
    const objectivesMap: Record<number, any> = {};

    rubricItems.forEach((item) => {
      if (!objectivesMap[item.objective_number]) {
        objectivesMap[item.objective_number] = {
          objectiveNumber: item.objective_number,
          objectiveText: item.objective_text,
          actions: [],
        };
      }

      const objective = objectivesMap[item.objective_number];
      let action = objective.actions.find((a: any) => a.actionNumber === item.action_number);

      if (!action) {
        action = {
          actionNumber: item.action_number,
          actionText: item.action_text,
          dimensions: {},
        };
        objective.actions.push(action);
      }

      action.dimensions[item.dimension] = item;
    });

    const objectives = Object.values(objectivesMap).sort((a: any, b: any) => a.objectiveNumber - b.objectiveNumber);
    objectives.forEach((obj: any) => {
      obj.actions.sort((a: any, b: any) => a.actionNumber - b.actionNumber);
    });

    return objectives;
  }

  /**
   * Get Spanish label for dimension type
   */
  private getDimensionLabel(dimension: 'cobertura' | 'frecuencia' | 'profundidad'): string {
    const labels = {
      cobertura: 'Cobertura',
      frecuencia: 'Frecuencia',
      profundidad: 'Profundidad',
    };
    return labels[dimension];
  }

  /**
   * Validate evaluation structure
   */
  private isValidEvaluation(evaluation: any): evaluation is AssessmentEvaluation {
    return (
      evaluation &&
      typeof evaluation === 'object' &&
      Array.isArray(evaluation.dimension_evaluations) &&
      typeof evaluation.overall_stage === 'number' &&
      typeof evaluation.overall_stage_label === 'string' &&
      Array.isArray(evaluation.strengths) &&
      Array.isArray(evaluation.growth_areas) &&
      typeof evaluation.summary === 'string' &&
      Array.isArray(evaluation.recommendations)
    );
  }
}
