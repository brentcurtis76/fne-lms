import { describe, it, expect } from 'vitest';
import { generateContractFromTemplate } from '../contract-template';

describe('generateContractFromTemplate', () => {
  // Minimal valid input. `cliente` is always present (it is a required join),
  // but `programa` is null for manual / imported contracts (programa_id = null).
  const baseContract = {
    numero_contrato: 'FNE-2025-11-633',
    fecha_contrato: '2025-11-27',
    fecha_fin: '2026-11-27',
    precio_total_uf: 1025.5,
    tipo_moneda: 'UF' as const,
    cliente: {
      nombre_legal: 'CORPORACIÓN EDUCACIONAL COLEGIO LAICO DE VALDIVIA',
      nombre_fantasia: 'Colegio Laico',
      rut: '65.111.111-1',
      direccion: 'Calle Falsa 123',
      comuna: 'Valdivia',
      ciudad: 'Valdivia',
      nombre_representante: 'Juan Pérez',
      rut_representante: '11.111.111-1',
    },
    cuotas: [{ numero_cuota: 1, fecha_vencimiento: '2025-12-01', monto_uf: 1025.5 }],
  };

  it('does not throw and returns a string when programa is null (manual contract)', () => {
    const manual = { ...baseContract, es_manual: true, programa: null };
    expect(() => generateContractFromTemplate(manual)).not.toThrow();

    const html = generateContractFromTemplate(manual);
    expect(typeof html).toBe('string');
    // Client data still renders, and the program placeholder is replaced (with '').
    expect(html).toContain('CORPORACIÓN EDUCACIONAL COLEGIO LAICO DE VALDIVIA');
    expect(html).not.toContain('{{PROGRAMA_NOMBRE}}');
  });

  it('does not throw when programa is omitted entirely', () => {
    expect(() => generateContractFromTemplate(baseContract)).not.toThrow();
  });

  it('still renders the program name for a program-based contract', () => {
    const withPrograma = {
      ...baseContract,
      programa: {
        nombre: 'Liderazgo Directivo',
        descripcion: 'Programa de asesoría',
        horas_totales: 40,
        modalidad: 'Online',
      },
    };
    const html = generateContractFromTemplate(withPrograma);
    expect(html).toContain('Liderazgo Directivo');
  });
});
