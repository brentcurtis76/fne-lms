/**
 * Licitaciones Excel Export Utility
 *
 * Exports licitaciones data to a .xlsx file with 19 columns.
 * Client-side only (uses XLSX.writeFile for browser download).
 * Follows the same pattern as lib/expenseReportExport.ts.
 */

import * as XLSX from 'xlsx';
import { LicitacionEstado, ESTADO_DISPLAY } from '@/types/licitaciones';

export interface LicitacionExportRow {
  id: string;
  numero_licitacion: string;
  nombre_licitacion: string;
  estado: LicitacionEstado;
  year: number;
  monto_minimo: number;
  monto_maximo: number;
  tipo_moneda: string;
  peso_evaluacion_tecnica: number;
  peso_evaluacion_economica: number;
  fecha_publicacion?: string | null;
  fecha_limite_solicitud_bases?: string | null;
  fecha_limite_propuestas?: string | null;
  fecha_limite_evaluacion?: string | null;
  fecha_adjudicacion?: string | null;
  monto_adjudicado_uf?: number | null;
  contrato_id?: string | null;
  schools?: { name: string } | null;
  programa?: { nombre: string } | null;
  ganador_ate?: { nombre_ate: string } | null;
}

export class LicitacionesExport {
  private static formatDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  private static formatNumber(value?: number | null): string {
    if (value == null) return '';
    return value.toLocaleString('es-CL');
  }

  static exportToExcel(licitaciones: LicitacionExportRow[]): void {
    const wb = XLSX.utils.book_new();

    // Build header row
    const headers = [
      'Numero',
      'Escuela',
      'Programa',
      'Nombre',
      'Estado',
      'Ano',
      'Fecha Publicacion',
      'Fecha Limite Bases',
      'Fecha Limite Propuestas',
      'Fecha Limite Evaluacion',
      'Monto Minimo',
      'Monto Maximo',
      'Moneda',
      'Peso Tecnico (%)',
      'Peso Economico (%)',
      'ATE Ganadora',
      'Monto Adjudicado',
      'Fecha Adjudicacion',
      'Contrato Vinculado',
    ];

    const rows: (string | number)[][] = [headers];

    for (const lic of licitaciones) {
      const estadoLabel = ESTADO_DISPLAY[lic.estado]?.label || lic.estado;
      const pesoEconomico = 100 - lic.peso_evaluacion_tecnica;

      rows.push([
        lic.numero_licitacion,
        lic.schools?.name || '',
        lic.programa?.nombre || '',
        lic.nombre_licitacion,
        estadoLabel,
        lic.year,
        this.formatDate(lic.fecha_publicacion),
        this.formatDate(lic.fecha_limite_solicitud_bases),
        this.formatDate(lic.fecha_limite_propuestas),
        this.formatDate(lic.fecha_limite_evaluacion),
        lic.monto_minimo,
        lic.monto_maximo,
        lic.tipo_moneda,
        lic.peso_evaluacion_tecnica,
        pesoEconomico,
        lic.ganador_ate?.nombre_ate || '',
        lic.monto_adjudicado_uf != null
          ? this.formatNumber(lic.monto_adjudicado_uf)
          : '',
        this.formatDate(lic.fecha_adjudicacion),
        lic.contrato_id ? 'Si' : 'No',
      ]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    sheet['!cols'] = [
      { wch: 20 }, // Numero
      { wch: 30 }, // Escuela
      { wch: 20 }, // Programa
      { wch: 40 }, // Nombre
      { wch: 22 }, // Estado
      { wch: 6  }, // Ano
      { wch: 16 }, // Fecha Publicacion
      { wch: 18 }, // Fecha Limite Bases
      { wch: 20 }, // Fecha Limite Propuestas
      { wch: 20 }, // Fecha Limite Evaluacion
      { wch: 14 }, // Monto Minimo
      { wch: 14 }, // Monto Maximo
      { wch: 8  }, // Moneda
      { wch: 14 }, // Peso Tecnico
      { wch: 16 }, // Peso Economico
      { wch: 30 }, // ATE Ganadora
      { wch: 18 }, // Monto Adjudicado
      { wch: 18 }, // Fecha Adjudicacion
      { wch: 18 }, // Contrato Vinculado
    ];

    XLSX.utils.book_append_sheet(wb, sheet, 'Licitaciones');

    const filename = `Licitaciones_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }
}
