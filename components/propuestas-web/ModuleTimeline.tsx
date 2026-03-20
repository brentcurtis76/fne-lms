import Image from 'next/image';
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

/** SVG ring segment for the distribution donut chart */
function RingSegment({
  percent,
  offset,
  color,
}: {
  percent: number;
  offset: number;
  color: string;
}) {
  const circumference = 2 * Math.PI * 54; // radius=54
  const dash = (percent / 100) * circumference;
  const gap = circumference - dash;

  return (
    <circle
      cx="64"
      cy="64"
      r="54"
      fill="none"
      stroke={color}
      strokeWidth="16"
      strokeDasharray={`${dash} ${gap}`}
      strokeDashoffset={-(offset / 100) * circumference}
      strokeLinecap="round"
      className="transition-all duration-700"
    />
  );
}

export default function ModuleTimeline({
  modules,
  totalHours,
  horasPresenciales,
  horasSincronicas,
  horasAsincronicas,
}: ModuleTimelineProps) {
  // Collect unique months for timeline
  const months = Array.from(
    new Set(modules.map((m) => m.mes).filter((m): m is number => m != null))
  ).sort((a, b) => a - b);

  // Calculate percentages for the donut chart
  const pctPresencial = totalHours > 0 ? (horasPresenciales / totalHours) * 100 : 0;
  const pctSincronica = totalHours > 0 ? (horasSincronicas / totalHours) * 100 : 0;
  const pctAsincronica = totalHours > 0 ? (horasAsincronicas / totalHours) * 100 : 0;

  // Max module hours for proportional bars
  const maxModuleHours = Math.max(
    ...modules.map(
      (m) => m.horas_presenciales + m.horas_sincronicas + m.horas_asincronicas
    ),
    1
  );

  return (
    <section className="relative bg-[#fafaf9] py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background illustration */}
      <div className="absolute inset-0 pointer-events-none">
        <Image src="/images/children-on-ladder.png" alt="" fill className="object-cover opacity-[0.03]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#fafaf9] via-[#fafaf9]/95 to-[#fafaf9]" />
      </div>

      {/* Decorative */}
      <div className="absolute top-0 right-16 w-px h-24 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-56 h-56 border border-[#fbbf24]/6 rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Section header */}
        <div className="mb-14">
          <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full" />
          <div className="flex items-center gap-3 mb-2">
            <Clock size={24} className="text-[#fbbf24]" />
            <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em]">
              Distribución Horaria
            </p>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a0a0a] leading-tight">
            Módulos y Horas
          </h2>
        </div>

        {/* Hours overview — donut chart + stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-14">
          {/* Donut chart */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                {/* Background ring */}
                <circle cx="64" cy="64" r="54" fill="none" stroke="#e5e5e5" strokeWidth="16" />
                {/* Segments */}
                <RingSegment percent={pctPresencial} offset={0} color="#fbbf24" />
                <RingSegment percent={pctSincronica} offset={pctPresencial} color="#0a0a0a" />
                <RingSegment percent={pctAsincronica} offset={pctPresencial + pctSincronica} color="#d4d4d4" />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[#0a0a0a]">{totalHours}</span>
                <span className="text-xs text-gray-400">horas</span>
              </div>
            </div>
          </div>

          {/* Stats breakdown */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Presenciales', value: horasPresenciales, color: 'bg-[#fbbf24]', pct: pctPresencial },
              { label: 'Sincrónicas', value: horasSincronicas, color: 'bg-[#0a0a0a]', pct: pctSincronica },
              { label: 'Asincrónicas', value: horasAsincronicas, color: 'bg-[#d4d4d4]', pct: pctAsincronica },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-sm text-gray-500">{item.label}</span>
                </div>
                <p className="text-3xl font-bold text-[#0a0a0a] mb-2">{item.value}</p>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.max(item.pct, 2)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">{Math.round(item.pct)}% del total</p>
              </div>
            ))}
          </div>
        </div>

        {/* Module cards with visual bars */}
        <div className="space-y-3 mb-14">
          <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>Módulo</span>
            <span className="hidden sm:block">Distribución de Horas</span>
          </div>

          {modules.map((mod, idx) => {
            const modTotal =
              mod.horas_presenciales + mod.horas_sincronicas + mod.horas_asincronicas;
            const barWidth = maxModuleHours > 0 ? (modTotal / maxModuleHours) * 100 : 0;

            return (
              <div
                key={idx}
                className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:shadow-md transition-all duration-200 hover:border-[#fbbf24]/30"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Module name + month */}
                  <div className="sm:w-2/5 flex items-center gap-3">
                    <span className="flex-shrink-0 w-8 h-8 bg-[#fbbf24]/10 rounded-lg flex items-center justify-center">
                      <span className="text-[#fbbf24] text-xs font-bold">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <div>
                      <p className="font-semibold text-[#0a0a0a] text-sm">{mod.nombre}</p>
                      <p className="text-xs text-gray-400">
                        {mod.mes ? MONTH_NAMES[mod.mes - 1] : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Visual bar */}
                  <div className="sm:w-2/5">
                    <div className="h-6 bg-gray-50 rounded-full overflow-hidden flex">
                      {mod.horas_presenciales > 0 && (
                        <div
                          className="h-full bg-[#fbbf24]"
                          style={{
                            width: `${(mod.horas_presenciales / modTotal) * barWidth}%`,
                          }}
                        />
                      )}
                      {mod.horas_sincronicas > 0 && (
                        <div
                          className="h-full bg-[#0a0a0a]"
                          style={{
                            width: `${(mod.horas_sincronicas / modTotal) * barWidth}%`,
                          }}
                        />
                      )}
                      {mod.horas_asincronicas > 0 && (
                        <div
                          className="h-full bg-[#d4d4d4]"
                          style={{
                            width: `${(mod.horas_asincronicas / modTotal) * barWidth}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Total hours */}
                  <div className="sm:w-1/5 text-right">
                    <span className="text-2xl font-bold text-[#0a0a0a]">{modTotal}</span>
                    <span className="text-sm text-gray-400 ml-1">hrs</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Summary row */}
          <div className="bg-[#0a0a0a] text-white rounded-xl p-5 flex items-center justify-between">
            <span className="font-bold text-sm uppercase tracking-wider">Total</span>
            <div className="flex items-center gap-6">
              <div className="hidden sm:flex gap-4 text-sm text-white/60">
                <span>{horasPresenciales} pres.</span>
                <span>{horasSincronicas} sinc.</span>
                <span>{horasAsincronicas} asinc.</span>
              </div>
              <span className="text-2xl font-bold text-[#fbbf24]">{totalHours} hrs</span>
            </div>
          </div>
        </div>

        {/* Timeline bar */}
        {months.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Calendar size={20} className="text-[#fbbf24]" />
              <h3 className="text-lg font-bold text-[#0a0a0a]">Línea de Tiempo</h3>
            </div>

            <div className="flex gap-2 rounded-2xl overflow-hidden">
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
                    className="bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] py-5 px-3 text-center min-w-[60px] rounded-lg hover:shadow-lg transition-shadow"
                    style={{ width: `${Math.max(widthPercent, 8)}%` }}
                  >
                    <p className="text-xs font-bold text-[#0a0a0a]">{MONTH_NAMES[month - 1]}</p>
                    <p className="text-lg font-bold text-[#0a0a0a] mt-1">{monthHours}</p>
                    <p className="text-[10px] text-[#0a0a0a]/60">horas</p>
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
