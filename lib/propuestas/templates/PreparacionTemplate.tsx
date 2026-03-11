/**
 * PreparacionTemplate — shorter proposal for Programa Preparación (88h).
 * Same structure as Evoluciona but with fewer content blocks and no platform section.
 *
 * Page order:
 *   1. CoverPage
 *   2. Educación Relacional (first content block, DarkSection style)
 *   3. TableOfContents
 *   4. Introduction (dark, single-column)
 *   5+. ContentBlocks alternating dark/light
 *   n. Equipo Consultor
 *   n+1. Propuesta Técnica — ModuleTable
 *   n+2. Propuesta Técnica — TimelineBar
 *   n+3. Propuesta Económica
 */
import React from 'react';
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { COLORS, FONTS } from '../styles';
import { CoverPage } from '../components/CoverPage';
import { DarkSection, DarkBody } from '../components/DarkSection';
import { ConsultantCard } from '../components/ConsultantCard';
import { ContentBlock } from '../components/ContentBlock';
import { ModuleTable } from '../components/ModuleTable';
import { PricingTable } from '../components/PricingTable';
import { TimelineBar } from '../components/TimelineBar';
import { TableOfContents } from '../components/TableOfContents';
import type { ProposalConfig } from '../generator';
import '../fonts';

const CONSULTANTS_PAGE_SIZE = 3;

const styles = StyleSheet.create({
  consultantsPage: {
    backgroundColor: COLORS.darkCharcoal,
    padding: 40,
    fontFamily: FONTS.family,
  },
  consultantsHeading: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 4,
  },
  consultantsRule: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.orange,
    marginBottom: 20,
  },
  consultantsGrid: {
    flexDirection: 'row',
    gap: 12,
    flexGrow: 1,
  },
});

function consultantPages(config: ProposalConfig): React.ReactNode[] {
  const pages: React.ReactNode[] = [];
  const groups: typeof config.consultants[] = [];

  for (let i = 0; i < config.consultants.length; i += CONSULTANTS_PAGE_SIZE) {
    groups.push(config.consultants.slice(i, i + CONSULTANTS_PAGE_SIZE));
  }

  groups.forEach((group, gi) => {
    pages.push(
      <Page key={`consultants-${gi}`} size="A4" style={styles.consultantsPage}>
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.consultantsHeading}>Equipo Consultor</Text>
          <View style={styles.consultantsRule} />
        </View>
        <View style={styles.consultantsGrid}>
          {group.map((c, ci) => (
            <ConsultantCard
              key={ci}
              nombre={c.nombre}
              titulo={c.titulo}
              bio={c.bio}
              fotoPath={c.fotoPath}
            />
          ))}
        </View>
      </Page>
    );
  });

  return pages;
}

export function PreparacionTemplate({ config }: { config: ProposalConfig }) {
  const {
    programYear,
    serviceName,
    schoolName,
    schoolLogoPath,
    contentBlocks,
    modules,
    horasPresenciales,
    horasSincronicas,
    horasAsincronicas,
    pricing,
    startMonth = 3,
    duration = 7,
  } = config;

  const tocSections = [
    ...contentBlocks.map((b) => b.titulo),
    'Equipo Consultor',
    'Propuesta Técnica — Módulos',
    'Propuesta Técnica — Calendario',
    'Propuesta Económica',
  ];

  const featuredBlock = contentBlocks[0];
  const remainingBlocks = contentBlocks.slice(1);
  const totalHours = horasPresenciales + horasSincronicas + horasAsincronicas;

  return (
    <>
      {/* Page 1: Cover */}
      <CoverPage
        programYear={programYear}
        serviceName={serviceName}
        schoolName={schoolName}
        schoolLogoPath={schoolLogoPath}
      />

      {/* Page 2: Educación Relacional */}
      {featuredBlock && (
        <DarkSection heading={featuredBlock.titulo} showLogo>
          {featuredBlock.contenido.sections
            .filter((s) => s.type === 'paragraph')
            .map((s, i) => (
              <DarkBody key={i}>{s.text ?? ''}</DarkBody>
            ))}
        </DarkSection>
      )}

      {/* Page 3: Table of Contents */}
      <TableOfContents sections={tocSections} year={programYear} />

      {/* Page 4: Introduction — dark, single-column */}
      <DarkSection heading="Sobre el Programa Preparación" showLogo>
        <DarkBody>{`El Programa Preparación es el punto de entrada del Modelo FNE para establecimientos que inician su proceso de transformación cultural. Con ${totalHours} horas de acompañamiento integral, entrega las bases relacionales y pedagógicas necesarias para sostener cambios profundos en la comunidad escolar.`}</DarkBody>
        <DarkBody>{`Este programa está diseñado para ${schoolName} y contempla ${horasPresenciales} horas presenciales, ${horasSincronicas} horas sincrónicas y ${horasAsincronicas} horas asincrónicas distribuidas en ${modules.length} módulos temáticos.`}</DarkBody>
        <DarkBody>
          A diferencia del Programa Evoluciona, el Programa Preparación no incluye
          Estadías INSPIRA ni Plataforma de Crecimiento Digital, concentrando el
          trabajo en los fundamentos del Modelo Relacional y el desarrollo de
          liderazgo para el cambio.
        </DarkBody>
      </DarkSection>

      {/* Content blocks */}
      {remainingBlocks.map((block, i) => (
        <ContentBlock key={block.key} block={block} index={i} />
      ))}

      {/* Equipo Consultor */}
      {consultantPages(config)}

      {/* Propuesta Técnica — ModuleTable */}
      <ModuleTable
        modules={modules}
        totals={{
          horas_presenciales: horasPresenciales,
          horas_sincronicas: horasSincronicas,
          horas_asincronicas: horasAsincronicas,
          total: totalHours,
        }}
      />

      {/* Propuesta Técnica — TimelineBar */}
      <TimelineBar
        modules={modules}
        startMonth={startMonth}
        duration={duration}
      />

      {/* Propuesta Económica */}
      <PricingTable
        mode={pricing.mode}
        precioUf={pricing.precioUf}
        totalHours={pricing.totalHours}
        formaPago={pricing.formaPago}
        fixedUf={pricing.fixedUf}
      />
    </>
  );
}
