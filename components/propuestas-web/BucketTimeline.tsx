import { Calendar } from 'lucide-react';
import type { SnapshotBucket } from '@/lib/propuestas-web/snapshot';

const PROGRAM_MONTHS = 8;

const DIST_STYLE: Record<string, { bar: string; label: string }> = {
  bloque: { bar: 'bg-[#fbbf24]', label: 'Taller' },
  cadencia: { bar: 'bg-[#fbbf24]/50', label: 'Recurrente' },
  flexible: { bar: 'bg-[#fbbf24]/25', label: 'Flexible' },
};

const MOD_BADGE: Record<string, string> = {
  presencial: 'text-[#fbbf24]',
  online: 'text-white/60',
  asincronico: 'text-white/40',
  hibrido: 'text-purple-300',
};

interface BucketTimelineProps {
  buckets: SnapshotBucket[];
}

export default function BucketTimeline({ buckets }: BucketTimelineProps) {
  if (!buckets || buckets.length === 0) return null;

  const months = Array.from({ length: PROGRAM_MONTHS }, (_, i) => i + 1);

  return (
    <div>
      <div className="flex items-center gap-2 mb-8">
        <Calendar size={20} className="text-[#fbbf24]" />
        <h3 className="text-lg font-bold text-[#0a0a0a]">Línea de Tiempo del Programa</h3>
      </div>

      {/* Timeline grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Month headers */}
          <div className="grid gap-1 mb-3" style={{ gridTemplateColumns: `220px repeat(${PROGRAM_MONTHS}, 1fr)` }}>
            <div />
            {months.map((m) => (
              <div key={m} className="text-center">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Mes {m}
                </span>
              </div>
            ))}
          </div>

          {/* Bucket rows */}
          <div className="space-y-2">
            {buckets.map((bucket) => {
              const style = DIST_STYLE[bucket.distributionType] ?? DIST_STYLE.bloque;
              const modBadge = MOD_BADGE[bucket.modalidad] ?? MOD_BADGE.presencial;

              return (
                <div
                  key={bucket.id}
                  className="grid gap-1 items-center group"
                  style={{ gridTemplateColumns: `220px repeat(${PROGRAM_MONTHS}, 1fr)` }}
                >
                  {/* Label */}
                  <div className="pr-3">
                    <p className="text-sm font-medium text-[#0a0a0a] leading-tight">
                      {bucket.label}
                    </p>
                    <p className={`text-[10px] ${modBadge}`}>
                      {bucket.hours} hrs · {style.label}
                    </p>
                  </div>

                  {/* Month cells */}
                  {months.map((m) => {
                    const isActive =
                      bucket.distributionType === 'bloque'
                        ? bucket.mes === m
                        : true; // cadencia + flexible span all months

                    return (
                      <div
                        key={m}
                        className="h-8 rounded-md flex items-center justify-center transition-all"
                      >
                        {isActive ? (
                          <div
                            className={`w-full h-full rounded-md ${style.bar} flex items-center justify-center group-hover:ring-1 group-hover:ring-[#fbbf24]/30 transition-all`}
                          >
                            {bucket.distributionType === 'bloque' && (
                              <span className="text-[10px] font-bold text-[#0a0a0a]">
                                {bucket.hours}h
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full rounded-md bg-gray-100" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-6 mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded bg-[#fbbf24]" />
              <span className="text-xs text-gray-500">Taller / Evento puntual</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded bg-[#fbbf24]/50" />
              <span className="text-xs text-gray-500">Sesiones recurrentes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded bg-[#fbbf24]/25" />
              <span className="text-xs text-gray-500">Disponible todo el programa</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
