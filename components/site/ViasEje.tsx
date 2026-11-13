import React, { useEffect, useRef } from 'react';
import { clamp, prefersReducedMotion } from './useSiteEffects';

/** The seven vías of the transformation, each read through the relational axis. */
const VIAS = [
  { name: 'Propósito', says: 'Un para qué compartido, construido entre todos.' },
  { name: 'Personalización', says: 'Cada estudiante es conocido, mirado y acompañado.' },
  { name: 'Aprendizaje', says: 'Se aprende con otros: cooperando, explicando, creando.' },
  { name: 'Evaluación', says: 'Una conversación que ayuda a crecer, no un veredicto.' },
  { name: 'Liderazgo', says: 'Distribuido: líderes que cuidan los vínculos de su equipo.' },
  { name: 'Familias', says: 'Aliadas del proyecto educativo, no espectadoras.' },
  { name: 'Trabajo docente', says: 'En equipo y por etapas, nunca en soledad.' },
];

/**
 * Seven horizontal tracks crossed by one vertical axis. The axis is drawn as
 * the section scrolls by; each vía lights up when the axis reaches it.
 */
export default function ViasEje() {
  const listRef = useRef<HTMLDivElement>(null);
  const isoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('li'));
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      list.style.setProperty('--p', '1');
      rows.forEach((row) => row.classList.add('on'));
      return;
    }

    const update = () => {
      const rect = list.getBoundingClientRect();
      const progress = clamp((window.innerHeight * 0.62 - rect.top) / rect.height);
      list.style.setProperty('--p', progress.toFixed(4));
      rows.forEach((row) => {
        const center = (row.offsetTop + row.offsetHeight / 2) / list.offsetHeight;
        row.classList.toggle('on', progress >= center);
      });
      if (isoRef.current) isoRef.current.style.rotate = `${(progress * 90).toFixed(2)}deg`;
    };
    let queued = false;
    const handler = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        update();
        queued = false;
      });
    };
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    update();
    return () => {
      window.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, []);

  return (
    <section className="vias" id="vias">
      <div className="iso" ref={isoRef} aria-hidden="true">
        <i className="mark line" />
      </div>
      <div className="wrap">
        <div className="head">
          <div className="eyebrow rv">El mapa del cambio</div>
          <h2 className="rv">
            <span className="l">Siete vías,</span> un mismo eje
          </h2>
          <p className="rv">
            La transformación de una escuela avanza por siete vías a la vez. Lo que las mantiene unidas es el eje
            relacional: en cada una, cambiar significa relacionarse de otra manera.
          </p>
        </div>
        <div className="eje" ref={listRef}>
          <span className="hilo" aria-hidden="true" />
          <span className="rotulo" aria-hidden="true">Eje relacional</span>
          <ol>
          {VIAS.map((via, index) => (
            <li key={via.name}>
              <div className="nom">
                <small>{String(index + 1).padStart(2, '0')}</small>
                <h3>{via.name}</h3>
              </div>
              <span className="nodo" aria-hidden="true" />
              <p className="dice">{via.says}</p>
            </li>
          ))}
          </ol>
        </div>
        <div className="pie">
          <div className="mano rv">primero el vínculo</div>
        </div>
      </div>
    </section>
  );
}
