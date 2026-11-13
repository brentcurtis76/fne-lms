import React from 'react';
import Link from 'next/link';
import SiteLayout from '../components/site/SiteLayout';
import TeamSection from '../components/site/TeamSection';

export default function EquipoPage() {
  return (
    <SiteLayout
      active="nosotros"
      title="Equipo · Fundación Nueva Educación"
      description="El equipo de la Fundación Nueva Educación: comité internacional, equipo FNE y asesores internacionales."
    >
      <section className="phero">
        <div className="iso" aria-hidden="true">
          <i className="mark line spin" style={{ background: '#fff' }} />
        </div>
        <i className="art" aria-hidden="true" style={{ ['--m' as string]: 'url(/sitio/linea-huddle.png)' }} />
        <div className="wrap">
          <div className="eyebrow rv">Equipo</div>
          <h1 className="rv">
            <span className="l">Una red de</span> personas que cambian la escuela
          </h1>
          <p className="lead rv">
            Educadores, directivos e investigadores de Chile y Catalunya que acompañan a cada comunidad educativa
            en su proceso de transformación.
          </p>
          <Link className="volver rv" href="/nosotros" data-testid="equipo-nosotros">
            ← Conoce la fundación
          </Link>
        </div>
      </section>
      <TeamSection />
    </SiteLayout>
  );
}
