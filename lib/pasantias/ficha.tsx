/**
 * Pasantías INSPIRA Barcelona — open ficha (D-05).
 *
 * The freely shareable summary of the January 2027 cohort: ONE document for
 * both programs (contract §7, DEC-04). It carries NO monetary information of
 * any kind and — by construction, not by discipline — cannot: this module
 * imports `cohort-public.ts` and never `cohort-commercial.ts`, so there is no
 * price in its reach to render. The brochure is the only document that quotes
 * the investment (D-02).
 *
 * Every fact is transcribed by reference from the public cohort module; the only
 * strings authored here are layout labels and the call to action. No page cap:
 * the document is as long as the ratified content needs, and react-pdf wraps a
 * page that overflows onto the next one rather than dropping content.
 */
import React from 'react';
import { Document, Page, StyleSheet, View, renderToBuffer } from '@react-pdf/renderer';
import { COLORS, FONTS, PAGE } from '../propuestas/styles';
import { LightBody } from '../propuestas/components/LightSection';
import { Caption, Heading } from '../propuestas/components/Typography';
import '../propuestas/fonts';
import { LEGAL_IDENTITY } from '../legal/privacy-notice';
import {
  COHORT_ACCREDITATION,
  COHORT_CITY,
  COHORT_CLAIMS,
  COHORT_DAY_STRUCTURE,
  COHORT_EXCLUDES,
  COHORT_FREE_WEEKEND,
  COHORT_HEADLINE,
  COHORT_HOSTS,
  COHORT_INCLUDES,
  COHORT_LABEL,
  COHORT_PLACES,
  COHORT_PROGRAMS,
  COHORT_ROUTING,
  COHORT_TOGETHER,
  type CohortProgram,
} from './cohort-public';
import { Bullets, ContactBlock, Masthead, Row } from './pdf/components';
import { FICHA_VERSION } from './pdf/filenames';
import {
  PASANTIAS_WHATSAPP,
  buildPasantiasWebUrl,
  type PasantiasPdfOptions,
} from './pdf/contact';
import { formatDayLong } from './pdf/format';

export { FICHA_FILENAME, FICHA_VERSION } from './pdf/filenames';

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: 40,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
    flexDirection: 'column',
  },
  block: {
    marginTop: 12,
  },
  columns: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 12,
  },
  column: {
    flex: 1,
    flexDirection: 'column',
  },
});

/** `a, b y c`. */
function joinEs(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** `2.5` → `2,5`. */
function formatDays(days: number): string {
  return String(days).replace('.', ',');
}

/** `lunes 18 de enero a jueves 28 de enero`. */
function dateRange(startDate: string, endDate: string): string {
  return `${formatDayLong(startDate)} a ${formatDayLong(endDate)}`;
}

/** One program's identity block, shared shape for both columns. */
function ProgramSummary({ program }: { program: CohortProgram }) {
  return (
    <View style={styles.column}>
      <Heading level={3}>{program.name}</Heading>
      <Row term="Para" value={program.audience} />
      <Row term="Fechas" value={dateRange(program.startDate, program.endDate)} />
      <Row term="Días en escuelas" value={String(program.schoolDays)} />
      <Row term="Escuelas" value={String(program.schoolCount)} />
      <LightBody>{program.overview}</LightBody>
      <Caption>{`Te llevas: ${program.takeaway}`}</Caption>
    </View>
  );
}

export function FichaDocument({ webUrl }: { webUrl: string }) {
  const [inspira, mirada] = COHORT_PROGRAMS;

  return (
    <Document
      title={`Pasantías INSPIRA Barcelona — ficha ${COHORT_LABEL}`}
      author={LEGAL_IDENTITY.brandName}
      language="es-CL"
    >
      <Page size="A4" style={styles.page}>
        <Masthead
          eyebrow={`INSPIRA · ${COHORT_CITY} · ${COHORT_LABEL}`}
          title="Pasantías INSPIRA Barcelona"
          subtitle={`${COHORT_LABEL} · ${COHORT_HEADLINE}`}
        />

        <LightBody>
          {`${COHORT_TOGETHER}. ${COHORT_ROUTING.map((route) => `${route.question} ${route.program}.`).join(' ')}`}
        </LightBody>

        <View style={styles.columns}>
          <ProgramSummary program={inspira} />
          <ProgramSummary program={mirada} />
        </View>

        <View style={styles.block}>
          <Heading level={3}>Calendario</Heading>
          {inspira.weeks.map((week) => (
            <Row
              key={`inspira-${week.id}`}
              term={`${inspira.name} · ${week.label}`}
              value={`${dateRange(week.startDate, week.endDate)} · ${week.summary}`}
            />
          ))}
          {mirada.weeks.map((week) => (
            <Row
              key={`mirada-${week.id}`}
              term={`${mirada.name} · ${week.label}`}
              value={`${dateRange(week.startDate, week.endDate)} · ${week.summary}`}
            />
          ))}
          <Row term="Fin de semana libre, ambos programas" value={COHORT_FREE_WEEKEND.label} />
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.columns}>
          <View style={styles.column}>
            <Heading level={3}>{`${inspira.name} — escuelas`}</Heading>
            <Bullets
              items={inspira.immersionSchools.map(
                (school) => `${school.name} — ${formatDays(school.days)} días por pasante`
              )}
            />
            <LightBody>
              {`Cada cohorte visita ${inspira.visits.count} de estas ${inspira.visits.candidates.length} escuelas:`}
            </LightBody>
            <Bullets items={inspira.visits.candidates} />
            <Caption>{inspira.visits.selection}</Caption>
            <Caption>
              {`${joinEs(inspira.visits.fullDayOutside)} están fuera de ${COHORT_CITY} y toman el día completo.`}
            </Caption>
          </View>
          <View style={styles.column}>
            <Heading level={3}>{`${mirada.name} — escuelas`}</Heading>
            <Bullets
              items={mirada.schools.map(
                (school) => `${school} — ${formatDays(mirada.daysPerSchool)} días completos`
              )}
            />
            <Caption>{mirada.orderCaveat}</Caption>
            <View style={styles.block}>
              <Heading level={3}>Antes, durante y después</Heading>
              <Bullets
                items={[
                  mirada.preparation,
                  `${formatDayLong(mirada.closing.date)}: ${mirada.closing.text}`,
                  mirada.followUp,
                ]}
              />
            </View>
          </View>
        </View>

        <View style={styles.block}>
          <Heading level={3}>Cómo es un día en las escuelas</Heading>
          <Bullets items={COHORT_DAY_STRUCTURE} />
        </View>

        <View style={styles.block}>
          <Heading level={3}>Quién te recibe</Heading>
          {COHORT_HOSTS.map((host) => (
            <Row
              key={host.name}
              term={host.name}
              value={`${host.role}, ${host.school} · ${host.note}`}
            />
          ))}
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Heading level={3}>El programa incluye</Heading>
            <Bullets items={COHORT_INCLUDES} />
            <Bullets items={[inspira.lunches, mirada.lunches]} />
            <Bullets items={mirada.extraIncludes.map((item) => `${mirada.name}: ${item}`)} />
          </View>
          <View style={styles.column}>
            <Heading level={3}>No incluye</Heading>
            <Bullets items={COHORT_EXCLUDES} />
          </View>
        </View>

        <View style={styles.block}>
          <Heading level={3}>La red en cifras</Heading>
          <Bullets items={COHORT_CLAIMS} />
          <Caption>{COHORT_ACCREDITATION}</Caption>
        </View>

        <View style={styles.block}>
          <Heading level={3}>Registra tu interés o resuelve tus dudas</Heading>
          <LightBody>{`${COHORT_PLACES} Escríbenos por WhatsApp o revisa los dos programas en la web.`}</LightBody>
          <ContactBlock
            identity={LEGAL_IDENTITY}
            webUrl={webUrl}
            whatsapp={PASANTIAS_WHATSAPP}
          />
          <View style={styles.block}>
            <Caption>{`Versión ${FICHA_VERSION}`}</Caption>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Render the ficha. Returns the PDF bytes; caching and serving are A4's job
 * (D-05), so nothing here touches storage or headers.
 */
export async function generateFicha(options: PasantiasPdfOptions = {}): Promise<Buffer> {
  const webUrl = buildPasantiasWebUrl(options.req);
  try {
    return await renderToBuffer(<FichaDocument webUrl={webUrl} />);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Ficha render failed (${FICHA_VERSION}): ${detail}`);
  }
}
