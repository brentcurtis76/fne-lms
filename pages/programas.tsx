import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SiteLayout from '../components/site/SiteLayout';
import FlipbookDialog from '../components/site/FlipbookDialog';
import { JOURNEY, ProgramId, programById } from '../components/site/programsData';

const DIRECTIVOS_FLIPBOOK = 'https://heyzine.com/flip-book/d87d80f309.html';

type Tab = 'objectives' | 'activities' | 'results';
const TAB_LABELS: Record<Tab, string> = {
  objectives: 'Objetivos',
  activities: 'Actividades',
  results: 'Resultados',
};

export default function ProgramasPage() {
  const [current, setCurrent] = useState(0);
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);
  const [tab, setTab] = useState<Tab>('objectives');
  const [showFlipbook, setShowFlipbook] = useState(false);
  const fichaRef = useRef<HTMLDivElement>(null);

  // /programas#inspira (the homepage doors link this way) opens that program.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace('#', '') as ProgramId;
      const index = JOURNEY.findIndex((step) => step.id === id);
      if (index < 0) return;
      setCurrent(index);
      setShown(index);
      setTab('objectives');
      fichaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  // Cross-fade the sheet when the program changes.
  useEffect(() => {
    if (current === shown) return;
    setFading(true);
    const timer = window.setTimeout(() => {
      setShown(current);
      setTab('objectives');
      setFading(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [current, shown]);

  const step = JOURNEY[shown];
  const program = programById(step.id);
  const tabs = (Object.keys(TAB_LABELS) as Tab[]).filter((key) => (program[key] ?? []).length > 0);
  const items = program[tab] ?? program.objectives;

  return (
    <SiteLayout
      active="programas"
      title="Programas · Fundación Nueva Educación"
      description="Inicia, Inspira, Aula Generativa y Evoluciona: cuatro programas que se combinan para acompañar a cada comunidad educativa en su viaje hacia una educación de vanguardia."
    >
      <section className="phero">
        <div className="iso" aria-hidden="true">
          <i className="mark line spin" style={{ background: '#fff' }} />
        </div>
        <i className="art" aria-hidden="true" style={{ ['--m' as string]: 'url(/sitio/linea-hanging-bridge.png)' }} />
        <div className="wrap">
          <div className="eyebrow rv">Programas</div>
          <h1 className="rv">
            <span className="l">Programas de</span> evolución educativa
          </h1>
          <p className="lead rv">
            Descubre nuestros programas, diseñados para acompañar a las comunidades educativas en su viaje hacia
            una educación de vanguardia.
          </p>
        </div>
      </section>

      <section className="cita-b">
        <div className="wrap cols">
          <i className="mark line spin rv" aria-hidden="true" />
          <blockquote className="rv">
            La evolución de la cultura de una escuela se basa en la conservación de su identidad, en la elevación
            de sus fortalezas y en la creación colectiva de una nueva mirada y nuevas habilidades.
          </blockquote>
        </div>
      </section>

      <section className="viaje" id="viaje">
        <div className="wrap">
          <div className="top">
            <div>
              <div className="eyebrow rv">El viaje de evolución</div>
              <h2 className="rv">
                <span className="l">Un modelo para armar</span> tu propio viaje
              </h2>
            </div>
            <p className="rv">
              Estos programas son autónomos y pueden combinarse según las necesidades de tu institución. Te
              presentamos un orden sugerido para iniciar y profundizar el cambio educativo.
            </p>
          </div>

          <div className="senda rv" role="tablist" aria-label="Programas">
            <i style={{ width: `${(current / (JOURNEY.length - 1)) * 75}%` }} />
            {JOURNEY.map((item, index) => (
              <button
                type="button"
                role="tab"
                key={item.id}
                id={item.id}
                aria-selected={index === current}
                className={index === current ? 'on' : index < current ? 'past' : undefined}
                onClick={() => setCurrent(index)}
                data-testid={`programa-${item.id}`}
              >
                <span className="pt" />
                <b>{item.name}</b>
                <span className="g">
                  {item.stage} · {item.detail}
                </span>
              </button>
            ))}
          </div>

          <div className="ficha rv" ref={fichaRef}>
            <div className="lam" style={{ ['--g' as string]: step.gradient }}>
              <i className="art" style={{ ['--m' as string]: `url(${step.art})` }} />
              <span className="k">
                Programas de {step.stage.toLowerCase()}
                {program.duration ? ` · ${program.duration}` : ''}
              </span>
              <h3>{step.name}</h3>
              <p>{program.subtitle}</p>
            </div>
            <div className="txt">
              <div className={`swap${fading ? ' out' : ''}`}>
                <p className="desc">{program.description}</p>
                <div className="tabs-p" role="tablist" aria-label={`Detalle de ${step.name}`}>
                  {tabs.map((key) => (
                    <button
                      type="button"
                      role="tab"
                      key={key}
                      aria-selected={tab === key}
                      onClick={() => setTab(key)}
                      data-testid={`programa-tab-${key}`}
                    >
                      {TAB_LABELS[key]}
                    </button>
                  ))}
                </div>
                <ol className="lista-p">
                  {items.map((item) => (
                    <li key={item}>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
                <div className="acc">
                  {step.id === 'inspira' && (
                    <Link className="btn mag" href="/pasantias" data-testid="inspira-pasantias-cta">
                      <span>Conoce las Pasantías en Barcelona</span>
                    </Link>
                  )}
                  <Link className={step.id === 'inspira' ? 'btn ghost' : 'btn mag'} href="/#contacto" data-testid="programa-contacto">
                    Contáctanos <span className="arr">→</span>
                  </Link>
                  <button type="button" className="txtlink" onClick={() => setShowFlipbook(true)} data-testid="directivos-flipbook-cta">
                    Programa Estratégico para Directivos <span>→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cierre">
        <i className="mark line deco spin" aria-hidden="true" />
        <div className="wrap">
          <div className="eyebrow rv" style={{ justifyContent: 'center' }}>El primer paso</div>
          <h2 className="rv">
            <span className="l">¿Listo para iniciar</span> este viaje de evolución?
          </h2>
          <p className="rv">Comienza hoy el camino hacia una educación de vanguardia para tu institución.</p>
          <div className="cta rv">
            <Link className="btn mag" href="/#contacto" data-testid="programas-cierre-contacto">
              Contáctanos <span className="arr">→</span>
            </Link>
            <Link className="btn ghost" href="/login" data-testid="programas-cierre-plataforma">
              Accede a la plataforma
            </Link>
          </div>
        </div>
      </section>

      <FlipbookDialog
        open={showFlipbook}
        onClose={() => setShowFlipbook(false)}
        title="Programa Estratégico Para Directivos"
        src={DIRECTIVOS_FLIPBOOK}
      />
    </SiteLayout>
  );
}
