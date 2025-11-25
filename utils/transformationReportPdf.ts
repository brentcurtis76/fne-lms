/**
 * PDF Report Generator for Transformation Assessment
 * FNE Branded - Professional B&W-friendly PDF document
 *
 * Brand Colors:
 * - brand_blue: #00365b (dark navy)
 * - brand_yellow: #fdb933 (gold accent)
 * - brand_beige: #e8e5e2 (warm background)
 */

interface DimensionEvaluation {
  rubricItemId: string;
  dimension: string;
  level: number;
  reasoning: string;
  evidence_quote: string;
  next_steps: string[];
}

interface AssessmentEvaluation {
  overall_stage: number;
  overall_stage_label: 'Incipiente' | 'Emergente' | 'Avanzado' | 'Consolidado';
  dimension_evaluations: DimensionEvaluation[];
  strengths: string[];
  growth_areas: string[];
  summary: string;
  recommendations: string[];
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
}

interface DimensionResponse {
  rubricItemId?: string;
  response?: string;
  answer?: string;
  suggestedLevel?: number | null;
  confirmedLevel?: number | null;
}

interface ReportData {
  communityName: string;
  schoolName?: string;
  generatedBy?: string;
  area: string;
  completedDate: string;
  evaluation: AssessmentEvaluation;
  rubricItems: RubricItem[];
  responses: Record<string, DimensionResponse>;
  viewMode?: 'detailed' | 'summary';
}

// FNE Brand Colors
const BRAND = {
  blue: '#00365b',
  yellow: '#fdb933',
  beige: '#e8e5e2',
  blueDark: '#002642',
  blueLight: '#1a4a6e',
};

const STAGE_DESCRIPTIONS: Record<number, string> = {
  1: 'La comunidad educativa está comenzando a explorar prácticas de personalización del aprendizaje. Las iniciativas son incipientes y requieren mayor sistematización.',
  2: 'Se observan avances en la implementación de prácticas de personalización. Existen iniciativas emergentes que necesitan consolidación y expansión.',
  3: 'La comunidad muestra un nivel avanzado de implementación. Las prácticas están bastante establecidas con oportunidades de profundización.',
  4: 'Las prácticas de personalización están consolidadas y son parte integral de la cultura escolar. Se observa un alto nivel de madurez institucional.',
};

const DIMENSION_LABELS: Record<string, string> = {
  cobertura: 'Cobertura',
  frecuencia: 'Frecuencia',
  profundidad: 'Profundidad',
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'Incipiente',
  2: 'Emergente',
  3: 'Avanzado',
  4: 'Consolidado',
};

/**
 * Generate HTML content for PDF export
 * This creates a print-optimized HTML document with FNE branding
 */
export function generateReportHtml(data: ReportData): string {
  const { communityName, schoolName, generatedBy, area, completedDate, evaluation, rubricItems, responses, viewMode = 'detailed' } = data;

  // Group rubric items by objective and action
  const objectives = groupByObjective(rubricItems);

  // Map responses to UUID keys if needed
  const mappedResponses = mapResponsesToUUID(responses, rubricItems);

  const areaTitle = area === 'personalizacion' ? 'Personalización del Aprendizaje' : 'Aprendizaje Profundo';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Evaluación - ${escapeHtml(communityName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: letter;
      margin: 0.75in 0.6in;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: white;
    }

    .page-break {
      page-break-before: always;
    }

    .avoid-break {
      page-break-inside: avoid;
    }

    /* Header */
    .report-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 20px;
      border-bottom: 3px solid ${BRAND.blue};
      margin-bottom: 28px;
    }

    .header-logo {
      flex-shrink: 0;
    }

    .header-logo img {
      height: 60px;
      width: auto;
    }

    .header-content {
      text-align: right;
      flex: 1;
      padding-left: 24px;
    }

    .report-header h1 {
      font-size: 18pt;
      font-weight: 700;
      margin-bottom: 4px;
      color: ${BRAND.blue};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .report-header h2 {
      font-size: 12pt;
      font-weight: 500;
      margin-bottom: 12px;
      color: ${BRAND.blueLight};
    }

    .report-meta {
      font-size: 9pt;
      color: #666;
    }

    .report-meta span {
      margin-left: 16px;
    }

    .report-meta span:first-child {
      margin-left: 0;
    }

    .school-banner {
      display: inline-block;
      background: ${BRAND.blue};
      color: white;
      padding: 4px 16px;
      border-radius: 4px;
      font-size: 10pt;
      font-weight: 600;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Executive Summary */
    .executive-summary {
      margin-bottom: 28px;
    }

    .section-title {
      font-size: 13pt;
      font-weight: 700;
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 2px solid ${BRAND.yellow};
      color: ${BRAND.blue};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stage-box {
      background: linear-gradient(135deg, ${BRAND.beige} 0%, #f5f3f1 100%);
      border: 2px solid ${BRAND.blue};
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 20px;
      text-align: center;
    }

    .stage-label {
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: ${BRAND.blueLight};
      margin-bottom: 6px;
      font-weight: 600;
    }

    .stage-value {
      font-size: 28pt;
      font-weight: 700;
      margin-bottom: 6px;
      color: ${BRAND.blue};
    }

    .stage-number {
      font-size: 11pt;
      color: ${BRAND.blueLight};
      margin-bottom: 14px;
      font-weight: 500;
    }

    .stage-number span {
      display: inline-block;
      background: ${BRAND.yellow};
      color: ${BRAND.blue};
      padding: 2px 12px;
      border-radius: 12px;
      font-weight: 700;
    }

    .stage-description {
      font-size: 9pt;
      color: #444;
      max-width: 550px;
      margin: 0 auto;
      line-height: 1.6;
    }

    .summary-text {
      font-style: italic;
      padding: 14px 18px;
      background: #f8f8f8;
      border-left: 4px solid ${BRAND.yellow};
      margin-bottom: 20px;
      font-size: 10pt;
      color: #333;
      line-height: 1.6;
    }

    /* Stats Grid */
    .stats-grid {
      display: flex;
      justify-content: space-between;
      margin-bottom: 24px;
      gap: 12px;
    }

    .stat-box {
      flex: 1;
      text-align: center;
      padding: 14px 10px;
      background: ${BRAND.beige};
      border-radius: 6px;
      border: 1px solid #d5d2cf;
    }

    .stat-value {
      font-size: 22pt;
      font-weight: 700;
      margin-bottom: 2px;
      color: ${BRAND.blue};
    }

    .stat-label {
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      font-weight: 600;
    }

    /* Lists */
    .findings-section {
      margin-bottom: 20px;
    }

    .findings-title {
      font-size: 11pt;
      font-weight: 700;
      margin-bottom: 10px;
      color: ${BRAND.blue};
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .findings-title::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 16px;
      background: ${BRAND.yellow};
      border-radius: 2px;
    }

    .findings-list {
      list-style: none;
      padding-left: 0;
      counter-reset: item;
    }

    .findings-list li {
      position: relative;
      padding-left: 28px;
      margin-bottom: 8px;
      font-size: 9.5pt;
      line-height: 1.5;
    }

    .findings-list li::before {
      content: counter(item);
      counter-increment: item;
      position: absolute;
      left: 0;
      width: 18px;
      height: 18px;
      background: ${BRAND.beige};
      border: 1px solid #ccc;
      border-radius: 50%;
      font-size: 8pt;
      font-weight: 600;
      text-align: center;
      line-height: 16px;
      color: ${BRAND.blue};
    }

    /* Recommendations */
    .recommendations-box {
      background: linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueLight} 100%);
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 28px;
      color: white;
    }

    .recommendations-title {
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .recommendations-title::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 16px;
      background: ${BRAND.yellow};
      border-radius: 2px;
    }

    .recommendations-list {
      list-style: none;
      padding-left: 0;
      counter-reset: rec;
    }

    .recommendations-list li {
      position: relative;
      padding-left: 32px;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      font-size: 9.5pt;
      line-height: 1.5;
    }

    .recommendations-list li:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .recommendations-list li::before {
      content: counter(rec);
      counter-increment: rec;
      position: absolute;
      left: 0;
      width: 20px;
      height: 20px;
      background: ${BRAND.yellow};
      border-radius: 50%;
      text-align: center;
      line-height: 20px;
      font-size: 9pt;
      font-weight: 700;
      color: ${BRAND.blue};
    }

    /* Objectives Section */
    .objective-section {
      margin-bottom: 24px;
    }

    .objective-header {
      background: ${BRAND.blue};
      color: white;
      padding: 10px 14px;
      margin-bottom: 14px;
      border-radius: 6px;
    }

    .objective-number {
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.8;
      margin-bottom: 2px;
    }

    .objective-text {
      font-size: 11pt;
      font-weight: 600;
    }

    /* Actions */
    .action-block {
      margin-bottom: 18px;
      padding-bottom: 18px;
      border-bottom: 1px solid #e0e0e0;
    }

    .action-block:last-child {
      border-bottom: none;
    }

    .action-header {
      font-weight: 600;
      margin-bottom: 10px;
      font-size: 10pt;
      color: ${BRAND.blue};
      padding-left: 8px;
      border-left: 3px solid ${BRAND.yellow};
    }

    /* Dimensions Table */
    .dimensions-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 9pt;
    }

    .dimensions-table th,
    .dimensions-table td {
      border: 1px solid #ddd;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }

    .dimensions-table th {
      background: ${BRAND.beige};
      font-weight: 600;
      text-transform: uppercase;
      font-size: 8pt;
      letter-spacing: 0.5px;
      color: ${BRAND.blue};
    }

    .dimension-name {
      font-weight: 600;
      width: 90px;
      color: #333;
    }

    .level-badge {
      display: inline-block;
      padding: 2px 10px;
      background: ${BRAND.blue};
      color: white;
      font-size: 8pt;
      font-weight: 600;
      border-radius: 10px;
    }

    .response-text {
      font-size: 9pt;
      color: #444;
      line-height: 1.5;
    }

    /* Summary View Styles */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .summary-dimension {
      background: ${BRAND.beige};
      border: 1px solid #d5d2cf;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }

    .summary-dimension-label {
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      margin-bottom: 4px;
      font-weight: 600;
    }

    .summary-dimension-level {
      font-size: 11pt;
      font-weight: 700;
      color: ${BRAND.blue};
    }

    .summary-action-header {
      font-weight: 600;
      font-size: 9pt;
      color: ${BRAND.blue};
      margin-bottom: 8px;
      padding: 6px 10px;
      background: ${BRAND.beige};
      border-radius: 4px;
    }

    .summary-action-block {
      margin-bottom: 14px;
    }

    /* Footer */
    .report-footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 2px solid ${BRAND.blue};
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-logo img {
      height: 36px;
      width: auto;
      opacity: 0.8;
    }

    .footer-text {
      text-align: right;
      font-size: 8pt;
      color: #666;
    }

    .footer-text .org-name {
      font-weight: 600;
      color: ${BRAND.blue};
      font-size: 9pt;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="report-header">
    <div class="header-logo">
      <img src="/Logo BW.png" alt="Fundación Nueva Educación" onerror="this.style.display='none'">
    </div>
    <div class="header-content">
      ${schoolName ? `<div class="school-banner">${escapeHtml(schoolName)}</div>` : ''}
      <h1>Reporte de Evaluación</h1>
      <h2>Vía de Transformación: ${areaTitle}</h2>
      <div class="report-meta">
        <span><strong>Comunidad:</strong> ${escapeHtml(communityName)}</span>
        <span><strong>Fecha:</strong> ${completedDate}</span>
        ${generatedBy ? `<span><strong>Generado por:</strong> ${escapeHtml(generatedBy)}</span>` : ''}
      </div>
    </div>
  </header>

  <!-- Executive Summary -->
  <section class="executive-summary">
    <h2 class="section-title">Resumen Ejecutivo</h2>

    <div class="stage-box avoid-break">
      <div class="stage-label">Nivel de Transformación Alcanzado</div>
      <div class="stage-value">${evaluation.overall_stage_label}</div>
      <div class="stage-number"><span>Etapa ${evaluation.overall_stage} de 4</span></div>
      <div class="stage-description">${STAGE_DESCRIPTIONS[evaluation.overall_stage] || ''}</div>
    </div>

    <div class="summary-text">
      "${escapeHtml(evaluation.summary)}"
    </div>

    <div class="stats-grid avoid-break">
      <div class="stat-box">
        <div class="stat-value">${evaluation.strengths.length}</div>
        <div class="stat-label">Fortalezas</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${evaluation.growth_areas.length}</div>
        <div class="stat-label">Áreas de Crecimiento</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${evaluation.dimension_evaluations.length}</div>
        <div class="stat-label">Dimensiones Evaluadas</div>
      </div>
    </div>
  </section>

  <!-- Findings -->
  <section class="findings-section avoid-break">
    <h3 class="findings-title">Fortalezas Identificadas</h3>
    <ol class="findings-list">
      ${evaluation.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('\n      ')}
    </ol>
  </section>

  <section class="findings-section avoid-break">
    <h3 class="findings-title">Áreas de Crecimiento</h3>
    <ol class="findings-list">
      ${evaluation.growth_areas.map(a => `<li>${escapeHtml(a)}</li>`).join('\n      ')}
    </ol>
  </section>

  <!-- Recommendations -->
  <section class="recommendations-box avoid-break">
    <h3 class="recommendations-title">Recomendaciones Prioritarias</h3>
    <ol class="recommendations-list">
      ${evaluation.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('\n      ')}
    </ol>
  </section>

  <div class="page-break"></div>

  <!-- Results by Objective -->
  <section>
    <h2 class="section-title">${viewMode === 'summary' ? 'Resumen de Resultados por Objetivo' : 'Resultados Detallados por Objetivo'}</h2>

    ${objectives.map(obj => `
    <div class="objective-section avoid-break">
      <div class="objective-header">
        <div class="objective-number">Objetivo ${obj.objectiveNumber}</div>
        <div class="objective-text">${escapeHtml(obj.objectiveText)}</div>
      </div>

      ${viewMode === 'summary' ? `
      <!-- Summary View: Compact grid of levels only -->
      ${obj.actions.map(action => {
        return `
      <div class="summary-action-block">
        <div class="summary-action-header">Acción ${action.actionNumber}: ${escapeHtml(action.actionText)}</div>
        <div class="summary-grid">
          ${['cobertura', 'frecuencia', 'profundidad'].map(dim => {
            const rubricItem = action.dimensions[dim as keyof typeof action.dimensions];
            if (!rubricItem) return '';

            const dimEval = evaluation.dimension_evaluations.find(e => e.rubricItemId === rubricItem.id);
            const level = dimEval?.level;
            const levelLabel = level ? LEVEL_LABELS[level] : '-';

            return `
          <div class="summary-dimension">
            <div class="summary-dimension-label">${DIMENSION_LABELS[dim]}</div>
            <div class="summary-dimension-level">${levelLabel}</div>
          </div>`;
          }).join('')}
        </div>
      </div>`;
      }).join('')}
      ` : `
      <!-- Detailed View: Full table with responses -->
      ${obj.actions.map(action => {
        return `
      <div class="action-block">
        <div class="action-header">Acción ${action.actionNumber}: ${escapeHtml(action.actionText)}</div>

        <table class="dimensions-table">
          <thead>
            <tr>
              <th>Dimensión</th>
              <th>Nivel</th>
              <th>Respuesta de la Comunidad</th>
            </tr>
          </thead>
          <tbody>
            ${['cobertura', 'frecuencia', 'profundidad'].map(dim => {
              const rubricItem = action.dimensions[dim as keyof typeof action.dimensions];
              if (!rubricItem) return '';

              const response = mappedResponses[rubricItem.id];
              const responseText = response?.response || response?.answer || 'Sin respuesta';

              // Match evaluation by rubricItemId directly
              const dimEval = evaluation.dimension_evaluations.find(e => e.rubricItemId === rubricItem.id);
              const level = dimEval?.level;
              const levelLabel = level ? LEVEL_LABELS[level] : '-';

              return `
            <tr>
              <td class="dimension-name">${DIMENSION_LABELS[dim]}</td>
              <td><span class="level-badge">${levelLabel}</span></td>
              <td class="response-text">${escapeHtml(responseText)}</td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
      }).join('')}
      `}
    </div>`).join('')}
  </section>

  <!-- Footer -->
  <footer class="report-footer">
    <div class="footer-logo">
      <img src="/Logo BW.png" alt="FNE" onerror="this.style.display='none'">
    </div>
    <div class="footer-text">
      <div class="org-name">Fundación Nueva Educación</div>
      <div>Reporte generado el ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </footer>
</body>
</html>
`;
}

/**
 * Group rubric items by objective and action
 */
function groupByObjective(rubricItems: RubricItem[]): Array<{
  objectiveNumber: number;
  objectiveText: string;
  actions: Array<{
    actionNumber: number;
    actionText: string;
    dimensions: Partial<Record<'cobertura' | 'frecuencia' | 'profundidad', RubricItem>>;
  }>;
}> {
  const objectivesMap: Record<number, {
    objectiveNumber: number;
    objectiveText: string;
    actions: Array<{
      actionNumber: number;
      actionText: string;
      dimensions: Partial<Record<'cobertura' | 'frecuencia' | 'profundidad', RubricItem>>;
    }>;
  }> = {};

  for (const item of rubricItems) {
    if (!objectivesMap[item.objective_number]) {
      objectivesMap[item.objective_number] = {
        objectiveNumber: item.objective_number,
        objectiveText: item.objective_text,
        actions: [],
      };
    }

    const objective = objectivesMap[item.objective_number];
    let action = objective.actions.find(a => a.actionNumber === item.action_number);

    if (!action) {
      action = {
        actionNumber: item.action_number,
        actionText: item.action_text,
        dimensions: {},
      };
      objective.actions.push(action);
    }

    action.dimensions[item.dimension] = item;
  }

  const objectives = Object.values(objectivesMap).sort((a, b) => a.objectiveNumber - b.objectiveNumber);
  objectives.forEach(obj => obj.actions.sort((a, b) => a.actionNumber - b.actionNumber));

  return objectives;
}

/**
 * Map semantic keys to UUID keys if needed
 */
function mapResponsesToUUID(
  responses: Record<string, DimensionResponse>,
  rubricItems: RubricItem[]
): Record<string, DimensionResponse> {
  const firstKey = Object.keys(responses)[0];
  if (!firstKey) return {};

  // Check if already UUID format
  const hyphenCount = (firstKey.match(/-/g) || []).length;
  if (hyphenCount >= 4) {
    return responses;
  }

  // Map semantic keys to UUIDs
  const mapped: Record<string, DimensionResponse> = {};

  for (const [key, response] of Object.entries(responses)) {
    const match = key.match(/objetivo(\d+)_accion(\d+)_(\w+)/);
    if (!match) continue;

    const [, objNum, actNum, dimType] = match;
    if (dimType === 'accion') continue; // Skip _accion responses

    const rubricItem = rubricItems.find(item =>
      item.objective_number === parseInt(objNum) &&
      item.action_number === parseInt(actNum) &&
      item.dimension === dimType
    );

    if (rubricItem) {
      mapped[rubricItem.id] = {
        ...response,
        response: response.response || response.answer || '',
      };
    }
  }

  return mapped;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Download the report as a PDF using browser print dialog
 */
export function downloadReportAsPdf(data: ReportData): void {
  const html = generateReportHtml(data);

  // Create a new window with the report
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para descargar el reporte.');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load, then trigger print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}
