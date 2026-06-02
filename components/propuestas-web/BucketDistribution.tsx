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

interface BucketDistributionProps {
  buckets: SnapshotBucket[];
}

export default function BucketDistribution({ buckets }: BucketDistributionProps) {
  if (!buckets || buckets.length === 0) return null;

  const grandTotal = buckets.reduce((sum, bucket) => sum + bucket.hours, 0);
  const byMod = buckets.reduce<Record<string, number>>((acc, bucket) => {
    acc[bucket.modalidad] = (acc[bucket.modalidad] || 0) + bucket.hours;
    return acc;
  }, {});

  return (
    <section id="actividades" className="pw-section pw-section--dark">
      <div className="pw-wrap">
        <div className="mb-12">
          <p className="pw-kicker mb-5">Programa de Actividades</p>
          <h2 className="pw-h2 flex items-center gap-3">
            <Layers size={30} className="text-[#fbbf24]" />
            <span>Distribución de Actividades</span>
          </h2>
        </div>

        <div className="pw-buckets-grid">
          {buckets.map((bucket) => (
            <article key={bucket.id} className="pw-bucket">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <h3 className="text-xl font-black leading-tight tracking-[-0.02em]">
                    {bucket.label}
                  </h3>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <span className="pw-chip">
                      {DIST_LABELS[bucket.distributionType] ?? bucket.distributionType}
                    </span>
                    <span className="pw-chip">
                      {MOD_LABELS[bucket.modalidad] ?? bucket.modalidad}
                    </span>
                    {bucket.isCustom && <span className="pw-chip">Personalizada</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="pw-bucket__hours">{bucket.hours}</span>
                  <span className="block text-xs font-black uppercase tracking-[0.18em] text-white/40 mt-2">
                    hrs
                  </span>
                </div>
              </div>

              {bucket.notes && (
                <p className="mt-5 pt-4 border-t border-white/10 text-sm leading-relaxed text-white/50">
                  {bucket.notes}
                </p>
              )}
            </article>
          ))}
        </div>

        <div className="pw-bucket-total">
          <div className="flex items-center gap-4">
            <span className="text-sm font-black uppercase tracking-[0.18em]">
              Total Actividades
            </span>
            <span className="text-4xl font-black tracking-[-0.04em]">{grandTotal} hrs</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(byMod).map(([mod, hours]) => (
              <span key={mod} className="text-sm font-semibold">
                {hours} {MOD_LABELS[mod] ?? mod}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
