/**
 * MINEDUC Ficha de Servicio compliance validation.
 * Enforced at generation time — errors block generation, warnings require human review.
 */
import type { PropuestaFichaServicio, PropuestaDocumentoBiblioteca } from './types';

export interface ValidationError {
  rule: number;
  field: string;
  expected: string;
  actual: string;
  message: string;
}

export interface ValidationWarning {
  rule: number;
  field: string;
  fichaValue: string;
  proposalValue: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Config fields required for MINEDUC compliance validation.
 * The generation endpoint maps ProposalConfig → ValidationConfig before calling.
 */
export interface ValidationConfig {
  nombre_servicio: string;
  horas_presenciales: number;
  horas_sincronicas: number;
  horas_asincronicas: number;
  destinatarios?: string[];
  consultores: Array<{ nombre: string }>;
  total_hours: number;
  modules?: Array<{
    horas_presenciales: number;
    horas_sincronicas: number;
    horas_asincronicas: number;
  }>;
  objetivo_general?: string;
}

export function validateProposalConfig(
  config: ValidationConfig,
  ficha: PropuestaFichaServicio,
  selectedDocuments?: Pick<PropuestaDocumentoBiblioteca, 'id' | 'nombre' | 'fecha_vencimiento'>[]
): ValidationResult {
  // Guard: return a validation error for missing required inputs rather than throwing
  if (!config || !ficha) {
    return {
      valid: false,
      errors: [
        {
          rule: 0,
          field: 'config',
          expected: 'config and ficha objects',
          actual: !config ? 'config is null/undefined' : 'ficha is null/undefined',
          message: 'Se requieren configuración y ficha de servicio para validar',
        },
      ],
      warnings: [],
    };
  }

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // RULE 1: nombre_servicio must match exactly
  if ((config.nombre_servicio ?? '') !== (ficha.nombre_servicio ?? '')) {
    errors.push({
      rule: 1,
      field: 'nombre_servicio',
      expected: ficha.nombre_servicio,
      actual: config.nombre_servicio,
      message: `El nombre del servicio debe coincidir exactamente con la Ficha. Esperado: "${ficha.nombre_servicio}"`,
    });
  }

  // RULE 2: presenciales + sincronicas <= ficha.horas_presenciales
  const horasRegistradas = (config.horas_presenciales ?? 0) + (config.horas_sincronicas ?? 0);
  if (horasRegistradas > (ficha.horas_presenciales ?? 0)) {
    errors.push({
      rule: 2,
      field: 'horas_presenciales',
      expected: `<= ${ficha.horas_presenciales}`,
      actual: String(horasRegistradas),
      message: `Las horas presenciales + sincrónicas (${horasRegistradas}) superan las horas registradas en la Ficha (${ficha.horas_presenciales})`,
    });
  }

  // RULE 3: horas_asincronicas >= 0 (extra hours on top of presenciales)
  if ((config.horas_asincronicas ?? 0) < 0) {
    errors.push({
      rule: 3,
      field: 'horas_asincronicas',
      expected: '>= 0',
      actual: String(config.horas_asincronicas),
      message: 'Las horas asincrónicas no pueden ser negativas',
    });
  }

  // RULE 4: destinatarios must be a subset of ficha.destinatarios
  if (config.destinatarios && config.destinatarios.length > 0) {
    const fichaDestinatarios = ficha.destinatarios ?? [];
    const fichaSet = new Set(fichaDestinatarios);
    const invalid = config.destinatarios.filter(d => !fichaSet.has(d));
    if (invalid.length > 0) {
      errors.push({
        rule: 4,
        field: 'destinatarios',
        expected: fichaDestinatarios.join(', ') || '(ninguno registrado)',
        actual: config.destinatarios.join(', '),
        message: `Los destinatarios "${invalid.join(', ')}" no están registrados en la Ficha de Servicio`,
      });
    }
  }

  // RULE 5: At least 2 consultores match ficha.equipo_trabajo by nombre
  if (ficha.equipo_trabajo && ficha.equipo_trabajo.length > 0) {
    const fichaNames = ficha.equipo_trabajo.map(m => (m.nombre ?? '').toLowerCase().trim());
    const matches = (config.consultores ?? []).filter(c => {
      const consultorName = (c.nombre ?? '').toLowerCase().trim();
      return fichaNames.some(fichaName => {
        const fichaWords = fichaName.split(/\s+/);
        return fichaWords.every(word => consultorName.includes(word));
      });
    });
    if (matches.length < 2) {
      errors.push({
        rule: 5,
        field: 'consultores',
        expected: '>= 2 coincidencias con equipo_trabajo',
        actual: `${matches.length} coincidencia(s)`,
        message: `Se requieren al menos 2 consultores del equipo registrado en la Ficha. Solo se encontraron ${matches.length}`,
      });
    }
  }

  // RULE 6: objetivo_general — show side-by-side comparison (warning, not error)
  if (ficha.objetivo_general && config.objetivo_general) {
    warnings.push({
      rule: 6,
      field: 'objetivo_general',
      fichaValue: ficha.objetivo_general,
      proposalValue: config.objetivo_general,
      message: 'Revise que el objetivo de la propuesta sea coherente con el objetivo de la Ficha de Servicio',
    });
  }

  // RULE 7: SUM(modules[].hours) must equal total_hours (internal consistency)
  if (config.modules && config.modules.length > 0) {
    const sumModuleHours = config.modules.reduce(
      (acc, m) => acc + m.horas_presenciales + m.horas_sincronicas + m.horas_asincronicas,
      0
    );
    if (sumModuleHours !== config.total_hours) {
      errors.push({
        rule: 7,
        field: 'modules',
        expected: String(config.total_hours),
        actual: String(sumModuleHours),
        message: `La suma de horas de los módulos (${sumModuleHours}) no coincide con el total de horas (${config.total_hours})`,
      });
    }
  }

  // Expired certificates — block generation
  if (selectedDocuments && selectedDocuments.length > 0) {
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    for (const doc of selectedDocuments) {
      if (doc.fecha_vencimiento && doc.fecha_vencimiento < todayStr) {
        errors.push({
          rule: 0,
          field: 'documentos',
          expected: 'Certificado vigente',
          actual: `Vencido el ${doc.fecha_vencimiento}`,
          message: `El documento "${doc.nombre}" está vencido (${doc.fecha_vencimiento}). Actualice el certificado antes de generar la propuesta`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
