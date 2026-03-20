import { Clock, Calendar } from 'lucide-react';
import type { SnapshotModule } from '@/lib/propuestas-web/snapshot';

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

interface ModuleTimelineProps {
  modules: SnapshotModule[];
  totalHours: number;
  horasPresenciales: number;
  horasSincronicas: number;
  horasAsincronicas: number;
}

export default function ModuleTimeline({
  modules,
  totalHours,
  horasPresenciales,
  horasSincronicas,
  horasAsincronicas,
}: ModuleTimelineProps) {
  // Collect unique months for timeline bar
  const months = Array.from(
    new Set(modules.map((m) => m.mes).filter((m): m is number => m != null))
  ).sort((a, b) => a - b);

  return (
    <section className="bg-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Clock size={28} className="text-[#fbbf24]" />
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0a0a0a]">
            Módulos y Distribución Horaria
          </h2>
        </div>

        {/* Hours summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <div className="bg-[#0a0a0a] text-white rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-[#fbbf24]">{totalHours}</p>
            <p className="text-sm text-white/60 mt-1">Horas Totales</p>
          </div>
          <div className="border-2 border-[#0a0a0a] rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-[#0a0a0a]">{horasPresenciales}</p>
            <p className="text-sm text-gray-500 mt-1">Presenciales</p>
          </div>
          <div className="border-2 border-[#0a0a0a] rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-[#0a0a0a]">{horasSincronicas}</p>
            <p className="text-sm text-gray-500 mt-1">Sincrónicas</p>
          </div>
          <div className="border-2 border-[#0a0a0a] rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-[#0a0a0a]">{horasAsincronicas}</p>
            <p className="text-sm text-gray-500 mt-1">Asincrónicas</p>
          </div>
        </div>

        {/* Module table */}
        <div className="border-2 border-[#0a0a0a] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0a0a0a] text-white">
                  <th className="text-left py-4 px-4 sm:px-6 font-semibold text-sm">Módulo</th>
                  <th className="text-center py-4 px-3 font-semibold text-sm hidden sm:table-cell">
                    Presencial
                  </th>
                  <th className="text-center py-4 px-3 font-semibold text-sm hidden sm:table-cell">
                    Sincrónica
                  </th>
                  <th className="text-center py-4 px-3 font-semibold text-sm hidden sm:table-cell">
                    Asincrónica
                  </th>
                  <th className="text-center py-4 px-3 font-semibold text-sm">Total</th>
                  <th className="text-center py-4 px-3 font-semibold text-sm">Mes</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((mod, idx) => {
                  const modTotal =
                    mod.horas_presenciales + mod.horas_sincronicas + mod.horas_asincronicas;
                  return (
                    <tr
                      key={idx}
                      className={`border-t border-gray-200 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="py-4 px-4 sm:px-6 font-medium text-[#0a0a0a]">
                        {mod.nombre}
                      </td>
                      <td className="text-center py-4 px-3 text-gray-600 hidden sm:table-cell">
                        {mod.horas_presenciales}
                      </td>
                      <td className="text-center py-4 px-3 text-gray-600 hidden sm:table-cell">
                        {mod.horas_sincronicas}
                      </td>
                      <td className="text-center py-4 px-3 text-gray-600 hidden sm:table-cell">
                        {mod.horas_asincronicas}
                      </td>
                      <td className="text-center py-4 px-3 font-bold text-[#0a0a0a]">
                        {modTotal}
                      </td>
                      <td className="text-center py-4 px-3 text-gray-600">
                        {mod.mes ? MONTH_NAMES[mod.mes - 1] : '—'}
                      </td>
                    </tr>
                  );
                })}
                {/* Summary row */}
                <tr className="border-t-2 border-[#0a0a0a] bg-[#0a0a0a] text-white font-bold">
                  <td className="py-4 px-4 sm:px-6">Total</td>
                  <td className="text-center py-4 px-3 hidden sm:table-cell">
                    {horasPresenciales}
                  </td>
                  <td className="text-center py-4 px-3 hidden sm:table-cell">
                    {horasSincronicas}
                  </td>
                  <td className="text-center py-4 px-3 hidden sm:table-cell">
                    {horasAsincronicas}
                  </td>
                  <td className="text-center py-4 px-3 text-[#fbbf24]">{totalHours}</td>
                  <td className="text-center py-4 px-3">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Timeline bar */}
        {months.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={20} className="text-[#fbbf24]" />
              <h3 className="text-lg font-bold text-[#0a0a0a]">Línea de Tiempo</h3>
            </div>
            <div className="flex gap-1 rounded-2xl overflow-hidden">
              {months.map((month) => {
                const monthModules = modules.filter((m) => m.mes === month);
                const monthHours = monthModules.reduce(
                  (sum, m) =>
                    sum + m.horas_presenciales + m.horas_sincronicas + m.horas_asincronicas,
                  0
                );
                const widthPercent = totalHours > 0 ? (monthHours / totalHours) * 100 : 0;

                return (
                  <div
                    key={month}
                    className="bg-gradient-to-r from-yellow-400 to-amber-500 py-4 px-3 text-center min-w-[60px]"
                    style={{ width: `${Math.max(widthPercent, 8)}%` }}
                  >
                    <p className="text-xs font-bold text-[#0a0a0a]">{MONTH_NAMES[month - 1]}</p>
                    <p className="text-xs text-[#0a0a0a]/70">{monthHours}h</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
