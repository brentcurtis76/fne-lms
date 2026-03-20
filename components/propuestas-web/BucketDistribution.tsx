import Image from 'next/image';
import { Layers } from 'lucide-react';
import type { SnapshotBucket } from '@/lib/propuestas-web/snapshot';

const DIST_LABELS: Record<string, string> = {
  bloque: 'Taller',
  cadencia: 'Sesiones regulares',
  flexible: 'Flexible',
};

const MOD_LABELS: Record<string, string> = {
  presencial: 'Presencial',
  online: 'Online',
  asincronico: 'Asincrónico',
  hibrido: 'Híbrido',
};

const MOD_COLORS: Record<string, { bg: string; text: string }> = {
  presencial: { bg: 'bg-[#fbbf24]', text: 'text-[#0a0a0a]' },
  online: { bg: 'bg-[#0a0a0a]', text: 'text-white' },
  asincronico: { bg: 'bg-[#d4d4d4]', text: 'text-[#0a0a0a]' },
  hibrido: { bg: 'bg-[#7c3aed]', text: 'text-white' },
};

interface BucketDistributionProps {
  buckets: SnapshotBucket[];
}

export default function BucketDistribution({ buckets }: BucketDistributionProps) {
  if (!buckets || buckets.length === 0) return null;

  const grandTotal = buckets.reduce((sum, b) => sum + b.hours, 0);

  // Group totals by modalidad
  const byMod = buckets.reduce<Record<string, number>>((acc, b) => {
    acc[b.modalidad] = (acc[b.modalidad] || 0) + b.hours;
    return acc;
  }, {});

  return (
    <section className="relative bg-[#111111] py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background illustration */}
      <div className="absolute inset-0 pointer-events-none">
        <Image
          src="/images/hanging-bridge.png"
          alt=""
          fill
          className="object-cover opacity-[0.06]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#111111] via-[#111111]/95 to-[#111111]" />
      </div>

      {/* Decorative */}
      <div className="absolute top-0 right-16 w-px h-24 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-56 h-56 border border-[#fbbf24]/6 rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Section header */}
        <div className="mb-14">
          <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full" />
          <div className="flex items-center gap-3 mb-2">
            <Layers size={24} className="text-[#fbbf24]" />
            <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em]">
              Programa de Actividades
            </p>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            Distribución de Actividades
          </h2>
        </div>

        {/* Bucket cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {buckets.map((bucket) => {
            const modColor = MOD_COLORS[bucket.modalidad] ?? MOD_COLORS.presencial;

            return (
              <div
                key={bucket.id}
                className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 hover:border-[#fbbf24]/30 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-base leading-tight mb-2">
                      {bucket.label}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                        {DIST_LABELS[bucket.distributionType] ?? bucket.distributionType}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${modColor.bg} ${modColor.text}`}
                      >
                        {MOD_LABELS[bucket.modalidad] ?? bucket.modalidad}
                      </span>
                      {bucket.isCustom && (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300">
                          Personalizada
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-3xl font-bold text-[#fbbf24]">{bucket.hours}</span>
                    <span className="text-sm text-white/40 ml-1">hrs</span>
                  </div>
                </div>

                {bucket.notes && (
                  <p className="text-xs text-white/40 leading-relaxed border-t border-white/5 pt-3">
                    {bucket.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary bar */}
        <div className="bg-[#fbbf24] rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-wider text-[#0a0a0a]">
              Total Actividades
            </span>
            <span className="text-3xl font-bold text-[#0a0a0a]">{grandTotal} hrs</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(byMod).map(([mod, hrs]) => {
              const modColor = MOD_COLORS[mod] ?? MOD_COLORS.presencial;
              return (
                <div key={mod} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${modColor.bg}`} />
                  <span className="text-sm text-[#0a0a0a]/70">
                    {hrs} {MOD_LABELS[mod] ?? mod}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
