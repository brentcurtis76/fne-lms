/**
 * EvolucionaTemplate — assembles a full Programa Evoluciona proposal PDF.
 *
 * Page order:
 *   1. CoverPage
 *   2. Educación Relacional (first content block, DarkSection style)
 *   3. TableOfContents
 *   4. Introduction (dark, two-column)
 *   5+. ContentBlocks alternating dark/light
 *   n. Equipo Consultor
 *   n+1. Propuesta Técnica — ModuleTable
 *   n+2. Propuesta Técnica — TimelineBar
 *   n+3. Propuesta Económica — PricingTable
 */
import React from 'react';
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { COLORS, FONTS } from '../styles';
import { CoverPage } from '../components/CoverPage';
import { DarkSection, DarkBody, DarkColumn } from '../components/DarkSection';
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

export function EvolucionaTemplate({ config }: { config: ProposalConfig }) {
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
    duration = 10,
  } = config;

  // Section titles for TOC — content blocks + structural sections
  const tocSections = [
    ...contentBlocks.map((b) => b.titulo),
    'Equipo Consultor',
    'Propuesta Técnica — Módulos',
    'Propuesta Técnica — Calendario',
    'Propuesta Económica',
  ];

  // First content block for the "Educación Relacional" featured page
  const featuredBlock = contentBlocks[0];
  const remainingBlocks = contentBlocks.slice(1);

  return (
    <>
      {/* Page 1: Cover */}
      <CoverPage
        programYear={programYear}
        serviceName={serviceName}
        schoolName={schoolName}
        schoolLogoPath={schoolLogoPath}
      />

      {/* Page 2: Educación Relacional (featured dark page) */}
      {featuredBlock && (
        <DarkSection heading={featuredBlock.titulo} showLogo columns={2}>
          <DarkColumn>
            {featuredBlock.contenido.sections
              .filter((s) => s.type === 'paragraph')
              .slice(0, 2)
              .map((s, i) => (
                <DarkBody key={i}>{s.text ?? ''}</DarkBody>
              ))}
          </DarkColumn>
          <DarkColumn>
            {featuredBlock.contenido.sections
              .filter((s) => s.type === 'paragraph')
              .slice(2)
              .map((s, i) => (
                <DarkBody key={i}>{s.text ?? ''}</DarkBody>
              ))}
          </DarkColumn>
        </DarkSection>
      )}

      {/* Page 3: Table of Contents */}
      <TableOfContents sections={tocSections} year={programYear} />

      {/* Pages 4–5: Introduction — dark, two-column */}
      <DarkSection
        heading="Sobre Fundación Nacional de Educación"
        columns={2}
        showLogo
      >
        <DarkColumn>
          <DarkBody>
            La Fundación Nacional de Educación (FNE) es una organización sin fines de
            lucro dedicada a fortalecer las comunidades educativas chilenas a través de
            procesos de consultoría basados en el Modelo de Educación Relacional.
          </DarkBody>
          <DarkBody>
            Con más de una década de trabajo en establecimientos educacionales públicos
            y privados a lo largo del país, FNE ha acompañado a cientos de equipos
            directivos y docentes en procesos de transformación cultural sostenibles.
          </DarkBody>
        </DarkColumn>
        <DarkColumn>
          <DarkBody>
            Nuestro modelo integra el acompañamiento técnico pedagógico con el
            desarrollo de habilidades relacionales, entendiendo que la calidad del
            aprendizaje depende directamente de la calidad de los vínculos que se
            construyen en la comunidad escolar.
          </DarkBody>
          <DarkBody>{`El Programa Evoluciona representa nuestra propuesta más comprehensiva, con ${horasPresenciales + horasSincronicas + horasAsincronicas} horas de acompañamiento integral diseñadas para ${schoolName}.`}</DarkBody>
        </DarkColumn>
      </DarkSection>

      {/* Content blocks — alternating dark (even) / light (odd) */}
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
          total: horasPresenciales + horasSincronicas + horasAsincronicas,
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
