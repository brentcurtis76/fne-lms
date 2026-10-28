import React from 'react';

/**
 * The coordinator page's frame: FNE black header with the yellow accent, white
 * body. No GENERA navigation — the visitor is an anonymous link holder.
 */
export default function IntakeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-brand_primary">
      <header className="bg-brand_primary text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="font-mont text-lg font-bold leading-tight">Fundación Nueva Educación</p>
            <p className="text-sm text-white/80">Pasantías Barcelona · Nómina de pasantes</p>
          </div>
          <span aria-hidden="true" className="h-8 w-1.5 rounded-full bg-brand_accent" />
        </div>
        <div aria-hidden="true" className="h-1 bg-brand_accent" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
