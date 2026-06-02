import { FileText } from 'lucide-react';
import type { SnapshotPricing } from '@/lib/propuestas-web/snapshot';

interface PricingSectionProps {
  pricing: SnapshotPricing;
}

export default function PricingSection({ pricing }: PricingSectionProps) {
  const totalUf =
    pricing.mode === 'fixed' && pricing.fixedUf
      ? pricing.fixedUf
      : pricing.precioUf * pricing.totalHours;

  return (
    <section id="propuesta-economica" className="pw-section pw-section--dark pw-pricing">
      <div className="pw-pricing__watermark">UF</div>
      <div className="pw-wrap relative z-10">
        <div className="pw-section__grid pw-section__grid--two items-end mb-12">
          <div>
            <p className="pw-kicker mb-5">Inversión</p>
            <h2 className="pw-h2">Propuesta Económica</h2>
          </div>
          <div />
        </div>

        <div className="pw-pricing__card">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0a0a0a]/60 mb-4">
            Inversión Total
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <span className="pw-pricing__amount">{totalUf.toFixed(2)}</span>
            <span className="pb-2 text-4xl font-black tracking-[-0.04em]">UF</span>
          </div>
        </div>

        {pricing.formaPago && (
          <div className="mt-10 flex items-start gap-4 border-l-4 border-[#fbbf24] pl-6">
            <FileText size={20} className="text-[#fbbf24] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-white font-black mb-1">Forma de Pago</p>
              <p className="text-white/60 leading-relaxed">{pricing.formaPago}</p>
              {pricing.formaPagoDetalle && (
                <p className="text-white/40 text-sm leading-relaxed mt-2">
                  {pricing.formaPagoDetalle}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
