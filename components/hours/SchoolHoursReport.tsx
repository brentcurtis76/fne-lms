/**
 * SchoolHoursReport — School-level hours dashboard
 *
 * Shows per-program tabs, ring chart (consumed/reserved/available),
 * bucket cards with three-state progress bars, session drill-down,
 * CSV export and PDF download buttons.
 */

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Download, FileText, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ReportExporter } from '../../lib/exportUtils';
import type { SchoolReportData, ProgramGroup, ContractSummary, BucketWithSessions, SessionDetail } from '../../lib/types/hour-tracking.types';

// ============================================================
// Lazy-load Recharts (avoids SSR issues)
// ============================================================
type DynAny = any; // eslint-disable-line
const PieChart = dynamic(() => import('recharts').then((mod) => ({ default: mod.PieChart })) as DynAny, { ssr: false }) as DynAny;
const Pie = dynamic(() => import('recharts').then((mod) => ({ default: mod.Pie })) as DynAny, { ssr: false }) as DynAny;
const Cell = dynamic(() => import('recharts').then((mod) => ({ default: mod.Cell })) as DynAny, { ssr: false }) as DynAny;
const Tooltip = dynamic(() => import('recharts').then((mod) => ({ default: mod.Tooltip })) as DynAny, { ssr: false }) as DynAny;
const ResponsiveContainer = dynamic(() => import('recharts').then((mod) => ({ default: mod.ResponsiveContainer })) as DynAny, { ssr: false }) as DynAny;

// ============================================================
// Constants
// ============================================================

const COLOR_CONSUMED = '#003A5B';
const COLOR_RESERVED = '#0066A4';
const COLOR_AVAILABLE = '#E0F0FF';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  consumida: { label: 'Consumida', className: 'bg-green-100 text-green-800' },
  reservada: { label: 'Reservada', className: 'bg-blue-100 text-blue-800' },
  penalizada: { label: 'Penalizada', className: 'bg-red-100 text-red-800' },
  devuelta: { label: 'Devuelta', className: 'bg-orange-100 text-orange-800' },
};

// ============================================================
// Props
// ============================================================

interface SchoolHoursReportProps {
  schoolId: number;
  isAdmin: boolean;
  schoolName?: string;
}

// ============================================================
// Ring Chart
// ============================================================

function RingChart({ consumed, reserved, available }: { consumed: number; reserved: number; available: number }) {
  const total = consumed + reserved + available;
  const data = total > 0
    ? [
        { name: 'Consumidas', value: consumed, color: COLOR_CONSUMED },
        { name: 'Reservadas', value: reserved, color: COLOR_RESERVED },
        { name: 'Disponibles', value: available, color: COLOR_AVAILABLE },
      ]
    : [{ name: 'Sin datos', value: 1, color: '#e5e7eb' }];

  return (
    <div
      role="img"
      aria-label={`Distribución de horas: ${consumed.toFixed(1)} consumidas, ${reserved.toFixed(1)} reservadas, ${available.toFixed(1)} disponibles de ${total.toFixed(0)} total`}
      className="relative w-40 h-40 flex items-center justify-center"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={68}
            paddingAngle={1}
            dataKey="value"
          >
            {data.map((entry: { color: string }, index: number) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toFixed(1)} h`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-bold text-gray-900">{total.toFixed(0)}</span>
        <span className="text-xs text-gray-500">horas</span>
      </div>
    </div>
  );
}

// ============================================================
// Progress bar — three-state horizontal
// ============================================================

function ProgressBar({ allocated, consumed, reserved }: { allocated: number; consumed: number; reserved: number }) {
  if (allocated <= 0) return null;
  const consumedPct = Math.min((consumed / allocated) * 100, 100);
  const reservedPct = Math.min((reserved / allocated) * 100, 100 - consumedPct);

  return (
    <div className="w-full h-2 rounded-full bg-[#E0F0FF] overflow-hidden">
      <div className="h-full flex">
        <div className="h-full rounded-l-full" style={{ width: `${consumedPct}%`, backgroundColor: COLOR_CONSUMED }} />
        <div className="h-full" style={{ width: `${reservedPct}%`, backgroundColor: COLOR_RESERVED }} />
      </div>
    </div>
  );
}

// ============================================================
// Bucket Card
// ============================================================

function BucketCard({ bucket }: { bucket: BucketWithSessions }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 truncate">{bucket.display_name}</h4>
          {bucket.annex_hours > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 mt-1">
              +{bucket.annex_hours.toFixed(1)} h Anexo
            </span>
          )}
        </div>
      </div>

      <div className="mb-2">
        <ProgressBar
          allocated={bucket.allocated}
          consumed={bucket.consumed}
          reserved={bucket.reserved}
        />
      </div>

      <div className="grid grid-cols-3 gap-1 text-xs text-center mb-3">
        <div>
          <div className="font-semibold text-gray-900">{bucket.consumed.toFixed(1)}</div>
          <div className="text-gray-500">Consumidas</div>
        </div>
        <div>
          <div className="font-semibold text-blue-700">{bucket.reserved.toFixed(1)}</div>
          <div className="text-gray-500">Reservadas</div>
        </div>
        <div>
          <div className="font-semibold text-green-700">{bucket.available.toFixed(1)}</div>
          <div className="text-gray-500">Disponibles</div>
        </div>
      </div>

      <div className="text-xs text-gray-500 text-center mb-2">
        {bucket.consumed.toFixed(1)} / {bucket.allocated.toFixed(1)} horas
      </div>

      {bucket.sessions.length > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-brand_primary hover:underline w-full justify-center"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Ocultar' : 'Ver Detalle'} ({bucket.sessions.length} sesiones)
        </button>
      )}

      {expanded && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th scope="col" className="text-left py-1 pr-2 font-medium text-gray-600">Fecha</th>
                <th scope="col" className="text-left py-1 pr-2 font-medium text-gray-600">Consultor</th>
                <th scope="col" className="text-left py-1 pr-2 font-medium text-gray-600">Título</th>
                <th scope="col" className="text-right py-1 pr-2 font-medium text-gray-600">Horas</th>
                <th scope="col" className="text-left py-1 font-medium text-gray-600">Estado</th>
                <th scope="col" className="text-right py-1 font-medium text-gray-600">Asistencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bucket.sessions.map((session: SessionDetail) => {
                const badge = STATUS_BADGE[session.status] ?? { label: session.status, className: 'bg-gray-100 text-gray-700' };
                return (
                  <tr key={session.session_id} className="hover:bg-gray-50">
                    <td className="py-1 pr-2 whitespace-nowrap text-gray-600">
                      {session.date
                        ? format(new Date(session.date + 'T00:00:00'), 'd MMM yyyy', { locale: es })
                        : '—'}
                    </td>
                    <td className="py-1 pr-2 text-gray-600 max-w-[80px] truncate">{session.consultant_name}</td>
                    <td className="py-1 pr-2 text-gray-600 max-w-[100px] truncate">{session.title}</td>
                    <td className="py-1 pr-2 text-right font-mono text-gray-700">{session.hours.toFixed(2)}</td>
                    <td className="py-1">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-1 text-right text-gray-500">
                      {session.attendance
                        ? `${session.attendance.attended}/${session.attendance.expected}`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {bucket.sessions.length === 0 && (
            <p className="text-center text-gray-500 py-2">
              No hay sesiones registradas en esta categoría
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Per-program view
// ============================================================

function ProgramView({ program }: { program: ProgramGroup }) {
  const [selectedContractId, setSelectedContractId] = useState<string>(
    program.contracts[0]?.contrato_id ?? ''
  );

  const selectedContract: ContractSummary | undefined = program.contracts.find(
    (c) => c.contrato_id === selectedContractId
  ) ?? program.contracts[0];

  if (!selectedContract) {
    return (
      <p className="text-center text-gray-500 py-8">
        Esta escuela no tiene programas activos
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Contract selector (only when multiple contracts) */}
      {program.contracts.length > 1 && (
        <div className="flex items-center gap-3">
          <label htmlFor="contract-selector" className="text-sm font-medium text-gray-700">Contrato:</label>
          <select
            id="contract-selector"
            value={selectedContractId}
            onChange={(e) => setSelectedContractId(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
          >
            {program.contracts.map((c) => (
              <option key={c.contrato_id} value={c.contrato_id}>
                {c.numero_contrato}{c.is_annexo ? ' (Anexo)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Summary ring chart + KPIs */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Ring chart — lazy loaded */}
          <div className="flex-shrink-0">
            <RingChart
              consumed={selectedContract.total_consumed}
              reserved={selectedContract.total_reserved}
              available={selectedContract.total_available}
            />
          </div>

          {/* Legend + totals */}
          <div className="flex flex-col gap-2 flex-1">
            <h3 className="text-sm font-semibold text-gray-900">{selectedContract.numero_contrato}</h3>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="text-sm">
                <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLOR_CONSUMED }} />
                <span className="text-gray-700">Consumidas: </span>
                <span className="font-semibold">{selectedContract.total_consumed.toFixed(1)} h</span>
              </div>
              <div className="text-sm">
                <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLOR_RESERVED }} />
                <span className="text-gray-700">Reservadas: </span>
                <span className="font-semibold">{selectedContract.total_reserved.toFixed(1)} h</span>
              </div>
              <div className="text-sm">
                <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLOR_AVAILABLE }} />
                <span className="text-gray-700">Disponibles: </span>
                <span className="font-semibold">{selectedContract.total_available.toFixed(1)} h</span>
              </div>
              <div className="text-sm">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-gray-300" />
                <span className="text-gray-700">Contratadas: </span>
                <span className="font-semibold">{selectedContract.total_contracted_hours.toFixed(1)} h</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bucket cards grid */}
      {selectedContract.buckets.length === 0 ? (
        <p className="text-center text-gray-500 py-4">
          No hay categorías de horas para este contrato.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selectedContract.buckets.map((bucket) => (
            <BucketCard key={bucket.hour_type_key} bucket={bucket} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Loading skeleton
// ============================================================

function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-64" />
      <div className="h-40 bg-gray-200 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export default function SchoolHoursReport({ schoolId, isAdmin, schoolName: initialSchoolName }: SchoolHoursReportProps) {
  const [data, setData] = useState<SchoolReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProgram, setActiveProgram] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/school-hours-report/${schoolId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Error al cargar el reporte');
        return;
      }
      setData(json.data ?? null);
      if (json.data?.programs?.length > 0) {
        setActiveProgram(json.data.programs[0].programa_id);
      }
    } catch {
      setError('Error de red al cargar el reporte.');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // ---- CSV Export ----
  function handleExportCSV() {
    if (!data || data.programs.length === 0) {
      toast.error('No hay datos para exportar.');
      return;
    }

    const rows: Record<string, string>[] = [];
    for (const program of data.programs) {
      for (const contract of program.contracts) {
        for (const bucket of contract.buckets) {
          if (bucket.sessions.length === 0) {
            // Add a row even for empty buckets
            rows.push({
              Programa: program.programa_name,
              Contrato: contract.numero_contrato,
              'Categoría': bucket.display_name,
              Fecha: '',
              Título: '',
              Consultor: '',
              Horas: '',
              Estado: '',
              'Asistencia Esperada': '',
              'Asistencia Real': '',
            });
          } else {
            for (const session of bucket.sessions) {
              rows.push({
                Programa: program.programa_name,
                Contrato: contract.numero_contrato,
                'Categoría': bucket.display_name,
                Fecha: session.date,
                Título: session.title,
                Consultor: session.consultant_name,
                Horas: session.hours.toFixed(2),
                Estado: session.status,
                'Asistencia Esperada': session.attendance ? String(session.attendance.expected) : '',
                'Asistencia Real': session.attendance ? String(session.attendance.attended) : '',
              });
            }
          }
        }
      }
    }

    const safeSchoolName = (data.school_name ?? 'escuela').replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);

    ReportExporter.exportToCSV({
      filename: `reporte-horas-${safeSchoolName}-${dateStr}`,
      title: `Reporte de Horas — ${data.school_name} (${dateStr})`,
      headers: ['Programa', 'Contrato', 'Categoría', 'Fecha', 'Título', 'Consultor', 'Horas', 'Estado', 'Asistencia Esperada', 'Asistencia Real'],
      data: rows,
      metadata: { totalRecords: rows.length },
    });

    toast.success('CSV descargado correctamente');
  }

  // ---- PDF Download ----
  function handleDownloadPDF() {
    window.open(`/api/school-hours-report/${schoolId}/pdf`, '_blank');
  }

  const schoolDisplayName = data?.school_name ?? initialSchoolName ?? 'Escuela';
  const activeProgData: ProgramGroup | undefined = data?.programs.find((p) => p.programa_id === activeProgram);

  if (loading) return <ReportSkeleton />;

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-medium">Error al cargar el reporte</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{schoolDisplayName}</h1>
        <div className="flex gap-2 flex-wrap">
          {data && data.programs.length > 0 && (
            <>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 px-4 py-2 bg-brand_accent text-brand_primary rounded-md text-sm font-semibold hover:bg-brand_accent_hover transition-colors"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                Descargar Reporte PDF
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Descargar CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!data || data.programs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          Esta escuela no tiene programas activos
        </div>
      ) : (
        <>
          {/* Program tabs — only shown when multiple programs */}
          {data.programs.length > 1 && (
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px space-x-6 overflow-x-auto">
                {data.programs.map((prog) => (
                  <button
                    key={prog.programa_id}
                    onClick={() => setActiveProgram(prog.programa_id)}
                    className={`whitespace-nowrap pb-3 text-sm font-medium border-b-2 transition-colors ${
                      activeProgram === prog.programa_id
                        ? 'border-brand_accent text-brand_primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {prog.programa_name}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Active program view */}
          {activeProgData ? (
            <ProgramView program={activeProgData} />
          ) : (
            <p className="text-center text-gray-500 py-8">
              Seleccione un programa para ver el detalle
            </p>
          )}
        </>
      )}
    </div>
  );
}
