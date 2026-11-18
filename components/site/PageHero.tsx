import React from 'react';

/**
 * The hero of an inner page (Programas, Nosotros, Equipo, Noticias): the
 * headline over the site's deep blue, with the turning isotype as its only
 * graphic. The line illustrations that used to sit in its corner were removed
 * on 18 November 2026: drawn that thin, they fought the isotype behind them.
 */
export default function PageHero({ children }: { children: React.ReactNode }) {
  return (
    <section className="phero">
      <div className="iso" aria-hidden="true">
        <i className="mark line spin" style={{ background: '#fff' }} />
      </div>
      <div className="wrap">{children}</div>
    </section>
  );
}
