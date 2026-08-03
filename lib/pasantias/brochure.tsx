/**
 * Pasantías INSPIRA Barcelona — full brochure (D-05).
 *
 * SERVER ONLY. This is the single legitimate importer of
 * `lib/pasantias/cohort-commercial.ts` (D-01): the prices it renders are allowed
 * to exist in this PDF's bytes and nowhere else (D-02). Importing this module
 * from a page, a component or anything that reaches a client bundle drags the
 * commercial module with it and `scripts/check-price-leak.mjs` fails the build.
 *
 * Every cohort fact comes from the two cohort modules; nothing is typed twice.
 * The only strings authored here are layout labels and the lodging coordination
 * framing, which Appendix A-8 delegates to this document ("se coordina con el
 * equipo FNE según tu preferencia", owner decision 2026-08-02).
 */
import React from 'react';
import { Document, Page, StyleSheet, View, renderToBuffer } from '@react-pdf/renderer';
import { COLORS, FONTS, PAGE } from '../propuestas/styles';
import { DarkBody, DarkSection } from '../propuestas/components/DarkSection';
import { LightBody, LightColumn, LightSection } from '../propuestas/components/LightSection';
import { Caption, Heading } from '../propuestas/components/Typography';
import '../propuestas/fonts';
import { LEGAL_IDENTITY } from '../legal/privacy-notice';
import {
  COHORT_CLAIMS,
  COHORT_DAY_STRUCTURE,
  COHORT_EXCLUDES,
  COHORT_EXPERTS,
  COHORT_FREE_DAYS,
  COHORT_HEADLINE,
  COHORT_IMMERSION_SCHOOLS,
  COHORT_INCLUDES,
  COHORT_LABEL,
  COHORT_LODGING_AREA,
  COHORT_OBJECTIVES,
  COHORT_SCHOOLS,
  COHORT_VISIT_DAY_COUNT,
  COHORT_VISIT_SCHOOLS,
  COHORT_WEEKS,
} from './cohort-public';
import {
  BROCHURE_VERSION,
  COHORT_LODGING_NOTE,
  COHORT_LODGING_PER_NIGHT_EUR,
  COHORT_MIN_PARTICIPANTS,
  COHORT_PAYMENT_TERMS,
  COHORT_PRICE_ITEMS,
  COHORT_PRICE_VALIDITY,
} from './cohort-commercial';
import { Bullets, ContactBlock, CoverContent, Numbered, Row } from './pdf/components';
import {
  PASANTIAS_WHATSAPP,
  buildPasantiasWebUrl,
  type PasantiasPdfOptions,
} from './pdf/contact';
import { formatDayLong, formatDayShort, formatEuro, formatEuroRange } from './pdf/format';

const styles = StyleSheet.create({
  cover: {
    backgroundColor: COLORS.darkCharcoal,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
    flexDirection: 'column',
  },
  blockSpacer: {
    marginTop: 14,
  },
  version: {
    marginTop: 16,
  },
});

/** `a, b y c` — the es-CL way to close an enumeration. */
function joinEs(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** `2.5` → `2,5`; the brief writes half-days with a comma. */
function formatDays(days: number): string {
  return String(days).replace('.', ',');
}

/** `Semana 1 — inmersión · lunes 5 de octubre a viernes 9 de octubre`. */
function weekHeading(week: (typeof COHORT_WEEKS)[number]): string {
  return `${week.label} · ${formatDayLong(week.startDate)} a ${formatDayLong(week.endDate)}`;
}

const fullDaySchools = COHORT_VISIT_SCHOOLS.filter((school) => school.fullDay);

const freeDaysSentence = `Entre ambas semanas hay un fin de semana largo — ${joinEs(
  COHORT_FREE_DAYS.map((day) => formatDayShort(day.date))
)} de octubre — sin actividades del programa:`;

const programme = COHORT_PRICE_ITEMS[0];

/**
 * The lodging figure as it reads in the investment table. The band, the "por
 * persona por noche" unit and the base-doble basis all come from Appendix A-8;
 * the verbatim `COHORT_LODGING_NOTE` sits directly under the table so the
 * precision the owner asked for is never only in a compressed table cell.
 */
const lodgingFigure = `${formatEuroRange(
  COHORT_LODGING_PER_NIGHT_EUR.min,
  COHORT_LODGING_PER_NIGHT_EUR.max
)} por persona por noche · base doble`;

/** Appendix A-8, lodging styling delegated to this document (2026-08-02). */
const LODGING_COORDINATION =
  'El alojamiento se coordina con el equipo FNE según tu preferencia.';

export function BrochureDocument({ webUrl }: { webUrl: string }) {
  return (
    <Document
      title={`Pasantías INSPIRA Barcelona — ${COHORT_LABEL}`}
      author={LEGAL_IDENTITY.brandName}
      language="es-CL"
    >
      {/* ── Portada ─────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.cover}>
        <CoverContent
          eyebrow={`INSPIRA · ${COHORT_LODGING_AREA} · ${COHORT_LABEL}`}
          title="Pasantías INSPIRA Barcelona"
          subtitles={[
            // Appendix A-1 (amended 2026-08-02): one continuous span, the year
            // beside it once. `COHORT_HEADLINE` already carries both — composing
            // the year here is what let this cover drift from the module.
            COHORT_HEADLINE,
            `${COHORT_VISIT_DAY_COUNT} días de visitas · ${COHORT_SCHOOLS.length} escuelas`,
          ]}
          claims={COHORT_CLAIMS}
        />
      </Page>

      {/* ── Qué es ──────────────────────────────────────────────────────── */}
      <LightSection heading="Qué es la pasantía">
        <LightBody>
          {`Dos semanas en ${COHORT_LODGING_AREA} conociendo en terreno las escuelas de vanguardia de la red de Nueva Educación: ${COHORT_VISIT_DAY_COUNT} días de visitas a ${COHORT_SCHOOLS.length} escuelas, con talleres de la tarde junto a los equipos que las dirigen.`}
        </LightBody>

        <View style={styles.blockSpacer}>
          <Row term="Cohorte" value={COHORT_LABEL} />
          <Row term="Fechas" value={COHORT_HEADLINE} />
          <Row term="Días de visitas" value={String(COHORT_VISIT_DAY_COUNT)} />
          <Row
            term="Escuelas"
            value={`${COHORT_SCHOOLS.length} (${COHORT_IMMERSION_SCHOOLS.length} de inmersión + ${COHORT_VISIT_SCHOOLS.length} de visita)`}
          />
          <Row term="Ciudad" value={COHORT_LODGING_AREA} />
        </View>

        <View style={styles.blockSpacer}>
          {/* The summaries name their own week ("Semana completa de inmersión…",
              "Visitas a una o dos escuelas por día"), so prefixing them with the
              week label would say it twice. The labelled, dated version is the
              Itinerario section. */}
          <Heading level={3}>Cómo se organizan las dos semanas</Heading>
          <Bullets items={COHORT_WEEKS.map((week) => week.summary)} />
        </View>

        <View style={styles.blockSpacer}>
          <Heading level={3}>La red en cifras</Heading>
          <Bullets items={COHORT_CLAIMS} />
        </View>
      </LightSection>

      {/* ── Objetivos ───────────────────────────────────────────────────── */}
      <LightSection heading="Objetivos">
        <LightBody>
          {`Los ${COHORT_OBJECTIVES.length} objetivos que ordenan el trabajo de las dos semanas:`}
        </LightBody>
        <Numbered items={COHORT_OBJECTIVES} />
      </LightSection>

      {/* ── Estructura del día ──────────────────────────────────────────── */}
      <LightSection heading="Estructura del día">
        <LightBody>
          Cada jornada de visita sigue la misma estructura en las escuelas que
          recibimos.
        </LightBody>
        {COHORT_DAY_STRUCTURE.map((block) => (
          <View key={block.label} style={styles.blockSpacer}>
            <Heading level={3}>{block.label}</Heading>
            <LightBody>{block.description}</LightBody>
          </View>
        ))}
      </LightSection>

      {/* ── Itinerario ──────────────────────────────────────────────────── */}
      <LightSection heading="Itinerario">
        <View>
          <Heading level={3}>{weekHeading(COHORT_WEEKS[0])}</Heading>
          <LightBody>{COHORT_WEEKS[0].summary}</LightBody>
          <Bullets
            items={COHORT_IMMERSION_SCHOOLS.map(
              (school) =>
                `${school.name} — ${formatDays(school.immersionDays ?? 0)} días por pasante`
            )}
          />
          <Bullets
            items={[
              `Días de visita: ${joinEs(COHORT_WEEKS[0].visitDays.map(formatDayShort))}`,
            ]}
          />
        </View>

        <View style={styles.blockSpacer}>
          <Heading level={3}>Fin de semana largo</Heading>
          <LightBody>{freeDaysSentence}</LightBody>
          <Bullets items={COHORT_FREE_DAYS.map((day) => day.label)} />
        </View>

        <View style={styles.blockSpacer}>
          <Heading level={3}>{weekHeading(COHORT_WEEKS[1])}</Heading>
          <LightBody>{COHORT_WEEKS[1].summary}</LightBody>
          <LightBody>
            {`${joinEs(
              fullDaySchools.map((school) => school.name)
            )} están fuera de ${COHORT_LODGING_AREA} y toman el día completo.`}
          </LightBody>
          <Bullets
            items={[
              `Días de visita: ${joinEs(COHORT_WEEKS[1].visitDays.map(formatDayShort))}`,
            ]}
          />
        </View>
      </LightSection>

      {/* ── Escuelas ────────────────────────────────────────────────────── */}
      <LightSection heading={`Las ${COHORT_SCHOOLS.length} escuelas`}>
        <LightBody>
          {`${COHORT_IMMERSION_SCHOOLS.length} escuelas de inmersión en la primera semana y ${COHORT_VISIT_SCHOOLS.length} escuelas de visita en la segunda.`}
        </LightBody>

        <View style={styles.blockSpacer}>
          <Heading level={3}>Semana 1 — inmersión</Heading>
          {COHORT_IMMERSION_SCHOOLS.map((school) => (
            <Row
              key={school.name}
              term={school.name}
              value={`${formatDays(school.immersionDays ?? 0)} días por pasante`}
            />
          ))}
        </View>

        <View style={styles.blockSpacer}>
          <Heading level={3}>Semana 2 — visitas</Heading>
          <Bullets
            items={COHORT_VISIT_SCHOOLS.map((school) =>
              school.fullDay
                ? `${school.name} — día completo, fuera de ${COHORT_LODGING_AREA}`
                : school.name
            )}
          />
          <Caption>El orden de las visitas puede variar.</Caption>
        </View>
      </LightSection>

      {/* ── Equipo ──────────────────────────────────────────────────────── */}
      <LightSection heading="Equipo">
        <LightBody>
          {`${COHORT_EXPERTS.length} profesionales acompañan la pasantía: la dirección del programa y los expertos que conducen las sesiones en cada escuela.`}
        </LightBody>
        <View style={styles.blockSpacer}>
          {COHORT_EXPERTS.map((expert) => (
            <Row
              key={expert.name}
              term={expert.name}
              value={expert.school ? `${expert.role} · ${expert.school}` : expert.role}
            />
          ))}
        </View>
      </LightSection>

      {/* ── Inversión ───────────────────────────────────────────────────── */}
      <DarkSection heading="Inversión" showLogo>
        <Row
          term={`${programme.label} (por persona)`}
          value={formatEuro(programme.amount)}
          color={COLORS.white}
          ruleColor={COLORS.grayMedium}
        />
        <Row
          term={`Alojamiento en ${COHORT_LODGING_AREA} (aparte del programa)`}
          value={lodgingFigure}
          color={COLORS.white}
          ruleColor={COLORS.grayMedium}
        />

        <View style={styles.blockSpacer}>
          <DarkBody>{COHORT_LODGING_NOTE}</DarkBody>
          <DarkBody>{LODGING_COORDINATION}</DarkBody>
        </View>

        <View style={styles.blockSpacer}>
          <Row
            term="Forma de pago"
            value={COHORT_PAYMENT_TERMS}
            color={COLORS.white}
            ruleColor={COLORS.grayMedium}
          />
          <Row
            term="Mínimo de participantes"
            value={`${COHORT_MIN_PARTICIPANTS} personas`}
            color={COLORS.white}
            ruleColor={COLORS.grayMedium}
          />
        </View>

        <View style={styles.blockSpacer}>
          <DarkBody>{COHORT_PRICE_VALIDITY}</DarkBody>
        </View>
      </DarkSection>

      {/* ── Incluye / no incluye ────────────────────────────────────────── */}
      <LightSection heading="Qué incluye" columns={2}>
        <LightColumn>
          <Heading level={3}>El programa incluye</Heading>
          <Bullets items={COHORT_INCLUDES} />
        </LightColumn>
        <LightColumn>
          <Heading level={3}>El programa no incluye</Heading>
          <Bullets items={COHORT_EXCLUDES} />
        </LightColumn>
      </LightSection>

      {/* ── Contacto ────────────────────────────────────────────────────── */}
      <LightSection heading="Contacto">
        <LightBody>
          {`Coordinación e inscripciones para la cohorte ${COHORT_LABEL}:`}
        </LightBody>
        <ContactBlock
          identity={LEGAL_IDENTITY}
          webUrl={webUrl}
          whatsapp={PASANTIAS_WHATSAPP}
        />
        <View style={styles.version}>
          <Caption>{`Versión ${BROCHURE_VERSION}`}</Caption>
        </View>
      </LightSection>
    </Document>
  );
}

/**
 * Render the brochure. Returns the PDF bytes; caching and serving are A4's job
 * (D-05), so nothing here touches storage or headers.
 */
export async function generateBrochure(options: PasantiasPdfOptions = {}): Promise<Buffer> {
  const webUrl = buildPasantiasWebUrl(options.req);
  try {
    return await renderToBuffer(<BrochureDocument webUrl={webUrl} />);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Brochure render failed (${BROCHURE_VERSION}): ${detail}`);
  }
}
