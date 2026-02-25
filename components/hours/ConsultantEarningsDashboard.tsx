/**
 * ConsultantEarningsDashboard — Earnings viewer with FX conversion
 *
 * Features:
 *   - Period selector (Desde/Hasta, default current quarter)
 *   - 3 KPI cards: Total Horas, Total EUR, Total CLP (border-l-4 pattern)
 *   - FX rate note with staleness warning
 *   - Earnings table with executed/penalized breakdown
 *   - CSV export button
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, TrendingUp, Banknote, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, startOfQuarter, endOfQuarter } from 'date-fns';
import { es } from 'date-fns/locale';
import { ReportExporter } from '../../lib/exportUtils';

// ============================================================
// Types
// ============================================================

interface EarningsRow {
  hour_type_key: string;
  display_name: string;
  total_hours: number;
  executed_hours: number;
  penalized_hours: number;
  rate_eur: number | null;
  total_eur: number;
  total_clp: number | null;
}

interface FxRateInfo {
  rate_clp_per_eur: number;
  fetched_at: string;
  is_stale: boolean;
  source: string;
}

interface EarningsTotals {
  total_hours: number;
  total_eur: number;
  total_clp: number | null;
}

interface EarningsData {
  consultant_id: string;
  period: { from: string; to: string };
  fx_rate: FxRateInfo;
  rows: EarningsRow[];
  totals: EarningsTotals;
}

interface ConsultantEarningsDashboardProps {
  consultantId: string;
  consultantName?: string;
}

// ============================================================
// Helpers
// ============================================================

function formatEur(value: number): string {
  return `€${value.toFixed(2)}`;
}

function formatClp(value: number | null): string {
  if (value === null) return '—';
  return `$${value.toLocaleString('es-CL')}`;
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr + 'T00:00:00'), 'd MMM yyyy', { locale: es });
  } catch {
    return dateStr;
  }
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const start = startOfQuarter(now);
  const end = endOfQuarter(now);
  return {
    from: format(start, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
  };
}

// ============================================================
// KPI Card (border-l-4 pattern from AnalyticsDashboard)
// ============================================================

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

function KPICard({ title, value, subtitle, icon, color }: KPICardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div
          className="p-3 rounded-full"
          style={{ backgroundColor: `${color}20` }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export default function ConsultantEarningsDashboard({
  consultantId,
  consultantName,
}: ConsultantEarningsDashboardProps) {
  const defaultRange = getDefaultDateRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // Load earnings
  // ============================================================

  const loadEarnings = useCallback(async () => {
    if (!from || !to) return;
    if (from > to) {
      setError('La fecha de inicio no puede ser posterior a la fecha de término.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(
        `/api/consultant-earnings/${consultantId}?${params.toString()}`
      );
      const json = await response.json();

      if (!response.ok) {
        setError(json.error ?? 'Error al cargar ganancias');
        return;
      }

      setData(json.data ?? null);
    } catch {
      setError('Error de red al cargar ganancias.');
    } finally {
      setLoading(false);
    }
  }, [consultantId, from, to]);

  useEffect(() => {
    loadEarnings();
  }, [loadEarnings]);

  // ============================================================
  // CSV export
  // ============================================================

  function handleExportCSV() {
    if (!data || data.rows.length === 0) {
      toast.error('No hay datos para exportar.');
      return;
    }

    const periodLabel = `${formatDate(data.period.from)}_${formatDate(data.period.to)}`;
    const filename = `ganancias_${consultantName?.replace(/\s+/g, '_') ?? consultantId}_${periodLabel}`;

    const exportRows = data.rows.map((row) => ({
      'Tipo de Hora': row.display_name,
      'Horas Totales': row.total_hours.toFixed(2),
      'Horas Ejecutadas': row.executed_hours.toFixed(2),
      'Horas Penalizadas': row.penalized_hours.toFixed(2),
      'Tarifa EUR/h': row.rate_eur !== null ? row.rate_eur.toFixed(2) : 'Sin tarifa',
      'Total EUR': row.total_eur.toFixed(2),
      'Total CLP': row.total_clp !== null ? String(row.total_clp) : 'N/D',
    }));

    // Add totals row
    exportRows.push({
      'Tipo de Hora': 'TOTAL',
      'Horas Totales': data.totals.total_hours.toFixed(2),
      'Horas Ejecutadas': '',
      'Horas Penalizadas': '',
      'Tarifa EUR/h': '',
      'Total EUR': data.totals.total_eur.toFixed(2),
      'Total CLP': data.totals.total_clp !== null ? String(data.totals.total_clp) : 'N/D',
    });

    ReportExporter.exportToCSV({
      filename,
      title: `Ganancias — ${consultantName ?? 'Consultor'} (${data.period.from} a ${data.period.to})`,
      headers: [
        'Tipo de Hora',
        'Horas Totales',
        'Horas Ejecutadas',
        'Horas Penalizadas',
        'Tarifa EUR/h',
        'Total EUR',
        'Total CLP',
      ],
      data: exportRows,
      metadata: {
        dateRange: `${formatDate(data.period.from)} — ${formatDate(data.period.to)}`,
        totalRecords: data.rows.length,
      },
    });

    toast.success('CSV descargado correctamente');
  }

  // ============================================================
  // Render
  // ============================================================

  const totals = data?.totals;
  const fxRate = data?.fx_rate;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
            />
          </div>
          <button
            onClick={loadEarnings}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-brand_accent text-brand_primary rounded-md text-sm font-semibold hover:bg-yellow-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          {data && data.rows.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors ml-auto"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          Cargando ganancias...
        </div>
      )}

      {/* KPI cards */}
      {!loading && data && (
        <>
          {/* FX rate note */}
          {fxRate && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                fxRate.is_stale
                  ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
              }`}
            >
              {fxRate.is_stale && <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
              <span>
                Tipo de cambio: <strong>1 EUR = {fxRate.rate_clp_per_eur.toLocaleString('es-CL')} CLP</strong>
                {' '}
                (actualizado: {formatDate(fxRate.fetched_at.slice(0, 10))})
                {fxRate.is_stale && (
                  <span className="ml-1 font-medium">
                    — Advertencia: este tipo de cambio puede estar desactualizado.
                  </span>
                )}
              </span>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              title="Total Horas"
              value={`${totals?.total_hours.toFixed(2) ?? '0.00'} h`}
              subtitle="Ejecutadas + Penalizadas"
              icon={<Clock className="h-6 w-6" />}
              color="#0a0a0a"
            />
            <KPICard
              title="Total EUR"
              value={formatEur(totals?.total_eur ?? 0)}
              subtitle="Según tarifas vigentes"
              icon={<TrendingUp className="h-6 w-6" />}
              color="#fbbf24"
            />
            <KPICard
              title="Total CLP"
              value={formatClp(totals?.total_clp ?? null)}
              subtitle={
                fxRate
                  ? `TC: ${fxRate.rate_clp_per_eur.toLocaleString('es-CL')} CLP/EUR`
                  : undefined
              }
              icon={<Banknote className="h-6 w-6" />}
              color="#1f1f1f"
            />
          </div>

          {/* Earnings table */}
          {data.rows.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No hay horas consumidas o penalizadas en el período seleccionado.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">
                  Desglose por Tipo de Hora
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-700">
                        Tipo de Hora
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">
                        Hs. Ejecutadas
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">
                        Hs. Penalizadas
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">
                        Total Horas
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">
                        Tarifa EUR/h
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">
                        Total EUR
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">
                        Total CLP
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.rows.map((row) => (
                      <tr key={row.hour_type_key} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {row.display_name}
                        </td>
                        <td className="px-4 py-3 text-right text-green-700">
                          {row.executed_hours.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-600">
                          {row.penalized_hours.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {row.total_hours.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {row.rate_eur !== null ? formatEur(row.rate_eur) : (
                            <span className="text-gray-400 text-xs">Sin tarifa</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium">
                          {formatEur(row.total_eur)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatClp(row.total_clp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                      <td className="px-4 py-3 text-gray-900">Total</td>
                      <td className="px-4 py-3 text-right text-green-700">
                        {data.rows
                          .reduce((s, r) => s + r.executed_hours, 0)
                          .toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-orange-600">
                        {data.rows
                          .reduce((s, r) => s + r.penalized_hours, 0)
                          .toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {totals?.total_hours.toFixed(2)}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right font-mono">
                        {formatEur(totals?.total_eur ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatClp(totals?.total_clp ?? null)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state when no data and not loading */}
      {!loading && !data && !error && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          Seleccione un período y haga clic en Actualizar para ver las ganancias.
        </div>
      )}
    </div>
  );
}
