import React, { useState } from 'react';
import Link from 'next/link';
import { JOURNEY } from './programsData';

/** The four programs as doors that open on hover, in the suggested order of the journey. */
export default function Puertas() {
  const [open, setOpen] = useState(0);

  return (
    <section className="puertas" id="programas">
      <div className="wrap top">
        <div>
          <div className="eyebrow rv">Programas</div>
          <h2 className="rv">
            <span className="l">Arma tu propio</span> viaje de evolución
          </h2>
        </div>
        <p className="rv">
          Cuatro programas autónomos que se combinan según las necesidades de cada institución. Este es el orden
          que sugerimos para iniciar y profundizar el cambio.
        </p>
      </div>
      <div className="doors rv">
        {JOURNEY.map((step, index) => (
          <Link
            key={step.id}
            className={`door${open === index ? ' open' : ''}`}
            href={`/programas#${step.id}`}
            style={{ ['--g' as string]: step.gradient }}
            onMouseEnter={() => setOpen(index)}
            onFocus={() => setOpen(index)}
            data-testid={`puerta-${step.id}`}
          >
            <i className="art" style={{ ['--m' as string]: `url(${step.art})` }} />
            <span className="paso-n">{String(index + 1).padStart(2, '0')}</span>
            <i className="mark line" />
            <span className="k">
              {step.stage} · {step.detail}
            </span>
            <h3>{step.name}</h3>
            <div className="more">
              <div>
                <p>{step.summary}</p>
                <span className="go">
                  Ver el programa <span>→</span>
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
