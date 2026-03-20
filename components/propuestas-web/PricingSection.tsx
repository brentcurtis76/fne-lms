import { DollarSign, FileText } from 'lucide-react';
import type { SnapshotPricing, SnapshotModule } from '@/lib/propuestas-web/snapshot';

interface PricingSectionProps {
  pricing: SnapshotPricing;
  modules: SnapshotModule[];
}

export default function PricingSection({ pricing, modules }: PricingSectionProps) {
  const totalModuleHours = modules.reduce(
    (sum, m) => sum + m.horas_presenciales + m.horas_sincronicas + m.horas_asincronicas,
    0
  );

  const totalUf =
    pricing.mode === 'fixed' && pricing.fixedUf
      ? pricing.fixedUf
      : pricing.precioUf * pricing.totalHours;

  return (
    <section className="bg-[#0a0a0a] py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <DollarSign size={28} className="text-[#fbbf24]" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Propuesta Económica</h2>
        </div>

        {/* Hours breakdown */}
        <div className="bg-white/10 rounded-2xl p-6 sm:p-8 mb-8">
          <h3 className="text-lg font-bold text-white mb-4">Distribución de Horas</h3>
          <div className="space-y-3">
            {modules.map((mod, idx) => {
              const modTotal =
                mod.horas_presenciales + mod.horas_sincronicas + mod.horas_asincronicas;
              return (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-white/10">
                  <span className="text-white/80">{mod.nombre}</span>
                  <span className="text-white font-medium">{modTotal} horas</span>
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-3">
              <span className="text-white font-bold">Total Horas</span>
              <span className="text-[#fbbf24] font-bold text-xl">{totalModuleHours} horas</span>
            </div>
          </div>
        </div>

        {/* Pricing calculation */}
        <div className="bg-white/10 rounded-2xl p-6 sm:p-8 mb-8">
          <h3 className="text-lg font-bold text-white mb-4">Valorización</h3>
          {pricing.mode === 'per_hour' ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <span className="text-white/80">Precio por hora</span>
                <span className="text-white font-medium">{pricing.precioUf.toFixed(2)} UF</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <span className="text-white/80">Total horas</span>
                <span className="text-white font-medium">{pricing.totalHours}</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-white/80">Inversión fija</span>
              <span className="text-white font-medium">{totalUf.toFixed(2)} UF</span>
            </div>
          )}
        </div>

        {/* Grand total */}
        <div className="bg-gradient-to-r from-yellow-400 to-amber-500 text-[#0a0a0a] rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider opacity-70">
                Inversión Total
              </p>
              <p className="text-4xl sm:text-5xl font-bold">{totalUf.toFixed(2)} UF</p>
            </div>
            <div className="text-right">
              {pricing.mode === 'per_hour' && (
                <p className="text-sm opacity-70">
                  {pricing.totalHours} horas x {pricing.precioUf.toFixed(2)} UF/hora
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Payment terms */}
        {pricing.formaPago && (
          <div className="mt-8 flex items-start gap-3">
            <FileText size={20} className="text-[#fbbf24] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-white font-semibold mb-1">Forma de Pago</p>
              <p className="text-white/70">{pricing.formaPago}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
