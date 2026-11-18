import React from 'react';
import Link from 'next/link';
import SiteLayout from '../components/site/SiteLayout';
import PageHero from '../components/site/PageHero';
import TeamSection from '../components/site/TeamSection';

export default function EquipoPage() {
  return (
    <SiteLayout
      active="nosotros"
      title="Equipo · Fundación Nueva Educación"
      description="El equipo de la Fundación Nueva Educación: comité internacional, equipo FNE y asesores y asesoras internacionales."
    >
      <PageHero>
        <div className="eyebrow rv">Equipo</div>
        <h1 className="rv">
          <span className="l">Una red de</span> personas que cambian la escuela
        </h1>
        <p className="lead rv">
          Profesionales de la educación, la dirección escolar y la investigación, de Chile y Catalunya, que
          acompañan a cada comunidad educativa en su proceso de transformación.
        </p>
        <Link className="volver rv" href="/nosotros" data-testid="equipo-nosotros">
          ← Conoce la fundación
        </Link>
      </PageHero>
      <TeamSection />
    </SiteLayout>
  );
}
