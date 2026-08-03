/**
 * Pasantías INSPIRA Barcelona — open ficha (D-05).
 *
 * The freely shareable one-to-two page summary. It carries NO monetary
 * information of any kind and — by construction, not by discipline — cannot:
 * this module imports `cohort-public.ts` and never `cohort-commercial.ts`, so
 * there is no price in its reach to render. The brochure is the only document
 * that quotes the investment (D-02).
 *
 * Every fact is transcribed by reference from the public cohort module; the only
 * strings authored here are layout labels and the call to action.
 */
import React from 'react';
import { Document, Page, StyleSheet, View, renderToBuffer } from '@react-pdf/renderer';
import { COLORS, FONTS, PAGE } from '../propuestas/styles';
import { LightBody } from '../propuestas/components/LightSection';
import { Caption, Heading } from '../propuestas/components/Typography';
import '../propuestas/fonts';
import { LEGAL_IDENTITY } from '../legal/privacy-notice';
import {
  COHORT_CLAIMS,
  COHORT_DATE_LABEL,
  COHORT_DAY_STRUCTURE,
  COHORT_EXPERTS,
  COHORT_FREE_DAYS,
  COHORT_IMMERSION_SCHOOLS,
  COHORT_LABEL,
  COHORT_LODGING_AREA,
  COHORT_SCHOOLS,
  COHORT_VISIT_DAY_COUNT,
  COHORT_VISIT_SCHOOLS,
  COHORT_WEEKS,
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

/**
 * The ficha has room for four names: the programme's direction and the two
 * week-1 immersion hosts, which is the order Appendix A-6 lists them in. The
 * full team is named in the caption underneath.
 */
const featuredExperts = COHORT_EXPERTS.slice(0, 4);

export function FichaDocument({ webUrl }: { webUrl: string }) {
  return (
    <Document
      title={`Pasantías INSPIRA Barcelona — ficha ${COHORT_LABEL}`}
      author={LEGAL_IDENTITY.brandName}
      language="es-CL"
    >
      <Page size="A4" style={styles.page}>
        <Masthead
          eyebrow={`INSPIRA · ${COHORT_LODGING_AREA} · ${COHORT_LABEL}`}
          title="Pasantías INSPIRA Barcelona"
          subtitle={`${COHORT_DATE_LABEL} de 2026 · ${COHORT_VISIT_DAY_COUNT} días de visitas · ${COHORT_SCHOOLS.length} escuelas`}
        />

        <LightBody>
          {`Dos semanas en ${COHORT_LODGING_AREA} conociendo en terreno las escuelas de vanguardia de la red de Nueva Educación, con talleres de la tarde junto a los equipos que las dirigen.`}
        </LightBody>

        <View style={styles.block}>
          <Heading level={3}>Fechas</Heading>
          <Row term={COHORT_WEEKS[0].label} value={`${formatDayLong(COHORT_WEEKS[0].startDate)} a ${formatDayLong(COHORT_WEEKS[0].endDate)}`} />
          <Row
            term="Fin de semana largo"
            value={`${formatDayLong(COHORT_FREE_DAYS[0].date)} a ${formatDayLong(
              COHORT_FREE_DAYS[COHORT_FREE_DAYS.length - 1].date
            )}`}
          />
          <Row term={COHORT_WEEKS[1].label} value={`${formatDayLong(COHORT_WEEKS[1].startDate)} a ${formatDayLong(COHORT_WEEKS[1].endDate)}`} />
          <Caption>{COHORT_FREE_DAYS[COHORT_FREE_DAYS.length - 1].label}</Caption>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Heading level={3}>{`Semana 1 — inmersión (${COHORT_IMMERSION_SCHOOLS.length} escuelas)`}</Heading>
            <Bullets
              items={COHORT_IMMERSION_SCHOOLS.map(
                (school) =>
                  `${school.name} — ${formatDays(school.immersionDays ?? 0)} días por pasante`
              )}
            />
          </View>
          <View style={styles.column}>
            <Heading level={3}>{`Semana 2 — visitas (${COHORT_VISIT_SCHOOLS.length} escuelas)`}</Heading>
            <Bullets
              items={COHORT_VISIT_SCHOOLS.map((school) =>
                school.fullDay ? `${school.name} — día completo` : school.name
              )}
            />
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <View>
          <Heading level={3}>Día tipo</Heading>
          <Bullets
            items={COHORT_DAY_STRUCTURE.map(
              (block) => `${block.label} — ${block.description}`
            )}
          />
        </View>

        <View style={styles.block}>
          <Heading level={3}>Equipo destacado</Heading>
          {featuredExperts.map((expert) => (
            <Row
              key={expert.name}
              term={expert.name}
              value={expert.school ? `${expert.role} · ${expert.school}` : expert.role}
            />
          ))}
          <Caption>
            {`El equipo completo son ${COHORT_EXPERTS.length} profesionales: ${joinEs(
              COHORT_EXPERTS.map((expert) => expert.name)
            )}.`}
          </Caption>
        </View>

        <View style={styles.block}>
          <Heading level={3}>La red en cifras</Heading>
          <Bullets items={COHORT_CLAIMS} />
        </View>

        <View style={styles.block}>
          <Heading level={3}>Postula o resuelve tus dudas</Heading>
          <LightBody>
            {`Escríbenos por WhatsApp o revisa el programa completo en la web. Cupos para la cohorte ${COHORT_LABEL}.`}
          </LightBody>
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
