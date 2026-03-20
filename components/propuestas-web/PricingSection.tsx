import Image from 'next/image';
import { DollarSign, FileText } from 'lucide-react';
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
    <section className="relative bg-[#0a0a0a] py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background illustration */}
      <div className="absolute inset-0 pointer-events-none">
        <Image src="/images/rock-climbers.png" alt="" fill className="object-cover opacity-[0.05]" />
        <div className="absolute inset-0 bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a]/95 to-[#0a0a0a]/85" />
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 left-12 w-px h-24 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />
      <div className="absolute -top-20 right-20 w-64 h-64 border border-[#fbbf24]/5 rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Section header */}
        <div className="mb-14">
          <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full" />
          <div className="flex items-center gap-3 mb-2">
            <DollarSign size={24} className="text-[#fbbf24]" />
            <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em]">
              Inversión
            </p>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            Propuesta Económica
          </h2>
        </div>

        {/* Grand total */}
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#fbbf24]" />
          <div className="absolute inset-0 opacity-10">
            <div
              className="w-full h-full"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 50%, rgba(0,0,0,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(0,0,0,0.05) 0%, transparent 50%)',
              }}
            />
          </div>

          <div className="relative p-8 sm:p-10 flex flex-col sm:flex-row justify-between items-center gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#0a0a0a]/60 mb-2">
                Inversión Total
              </p>
              <p className="text-5xl sm:text-6xl font-bold text-[#0a0a0a]">
                {totalUf.toFixed(2)}{' '}
                <span className="text-3xl sm:text-4xl font-semibold">UF</span>
              </p>
            </div>
          </div>
        </div>

        {/* Payment terms */}
        {pricing.formaPago && (
          <div className="mt-10 flex items-start gap-4 border-l-4 border-[#fbbf24] pl-6">
            <FileText size={20} className="text-[#fbbf24] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-white font-semibold mb-1">Forma de Pago</p>
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
