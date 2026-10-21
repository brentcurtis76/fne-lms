/**
 * Pasantías INSPIRA Barcelona — full brochure (D-05).
 *
 * SERVER ONLY. This is the single legitimate importer of
 * `lib/pasantias/cohort-commercial.ts` (D-01): the prices it renders are allowed
 * to exist in this PDF's bytes and nowhere else (D-02). Importing this module
 * from a page, a component or anything that reaches a client bundle drags the
 * commercial module with it and `scripts/check-price-leak.mjs` fails the build.
 *
 * January 2027: ONE brochure for both programs (contract §7, DEC-04). This
 * generated document is the data-faithful fallback; the published brochure is
 * Brent's corrected designed file, uploaded at this version's cache key before
 * the deployment that ships `BROCHURE_VERSION` (R-08). Whatever sits at that key
 * is served as-is (`lib/pasantias/pdf/serve.ts`).
 *
 * Every cohort fact comes from the two cohort modules; nothing is typed twice.
 * The only strings authored here are layout labels.
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
  COHORT_PROGRAMS,
  COHORT_ROUTING,
  COHORT_TOGETHER,
  type CohortProgram,
} from './cohort-public';
import {
  ARRIVAL_DATE,
  BROCHURE_VERSION,
  DISCOUNT_CONDITION,
  FLIGHT_CLP_APPROX,
  LODGING_NOTE,
  PAYMENT_TERMS,
  PLACES_TERMS,
  PRICE_VALIDITY,
  PROGRAM_PRICING,
  TEAM_NOTE,
  TOTALS_NOTE,
  teamRows,
} from './cohort-commercial';
import { Bullets, ContactBlock, CoverContent, Row } from './pdf/components';
import {
  PASANTIAS_WHATSAPP,
  buildPasantiasWebUrl,
  type PasantiasPdfOptions,
} from './pdf/contact';
import { formatClp, formatClpRange, formatDayLong } from './pdf/format';

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

/** `2.5` → `2,5`; the brochure writes half-days with a comma. */
function formatDays(days: number): string {
  return String(days).replace('.', ',');
}

/** `lunes 18 de enero a viernes 22 de enero`. */
function dateRange(startDate: string, endDate: string): string {
  return `${formatDayLong(startDate)} a ${formatDayLong(endDate)}`;
}

/** Light-section rows on the dark investment page. */
const DARK_ROW = { color: COLORS.white, ruleColor: COLORS.grayMedium } as const;

/** One program's investment block. */
function ProgramInvestment({ program }: { program: CohortProgram }) {
  const pricing = PROGRAM_PRICING[program.id];
  return (
    <View style={styles.blockSpacer}>
      <Heading level={3} color={COLORS.white}>
        {program.name}
      </Heading>
      <Row term="Programa (por persona)" value={formatClp(pricing.feeClp)} {...DARK_ROW} />
      <Row
        term={`Programa con descuento · ${DISCOUNT_CONDITION}`}
        value={formatClp(pricing.discountedFeeClp)}
        {...DARK_ROW}
      />
      <Row
        term="Noches de alojamiento"
        value={`${pricing.nights} · llegada ${formatDayLong(ARRIVAL_DATE)}, regreso ${formatDayLong(
          pricing.returnDate
        )}`}
        {...DARK_ROW}
      />
      <Row
        term="Total por persona"
        value={formatClpRange(...pricing.perPersonClp.standard)}
        {...DARK_ROW}
      />
      <Row
        term={`Total por persona · ${DISCOUNT_CONDITION}`}
        value={formatClpRange(...pricing.perPersonClp.discounted)}
        {...DARK_ROW}
      />
    </View>
  );
}

/** One program's page-15 team table. */
function ProgramTeamTable({ program }: { program: CohortProgram }) {
  return (
    <View style={styles.blockSpacer}>
      <Heading level={3}>{program.name}</Heading>
      {teamRows(program.id).map((row) => (
        <Row
          key={`${program.id}-${row.size}`}
          term={`Equipo de ${row.size}`}
          value={`${formatClpRange(...row.standard)} · con descuento ${formatClpRange(
            ...row.discounted
          )}`}
        />
      ))}
    </View>
  );
}

export function BrochureDocument({ webUrl }: { webUrl: string }) {
  const [inspira, mirada] = COHORT_PROGRAMS;

  return (
    <Document
      title={`Pasantías INSPIRA Barcelona — ${COHORT_LABEL}`}
      author={LEGAL_IDENTITY.brandName}
      language="es-CL"
    >
      {/* ── Portada ─────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.cover}>
        <CoverContent
          eyebrow={`INSPIRA · ${COHORT_CITY} · ${COHORT_LABEL}`}
          title="Pasantías INSPIRA Barcelona"
          subtitles={[COHORT_HEADLINE, `${inspira.name} · ${mirada.name}`, COHORT_TOGETHER]}
          claims={COHORT_CLAIMS}
        />
      </Page>

      {/* ── Dos programas ───────────────────────────────────────────────── */}
      <LightSection heading={`${inspira.name} y ${mirada.name}`}>
        <LightBody>
          {COHORT_ROUTING.map((route) => `${route.question} ${route.program}.`).join(' ')}
        </LightBody>
        {[inspira, mirada].map((program) => (
          <View key={program.id} style={styles.blockSpacer}>
            <Heading level={3}>{program.name}</Heading>
            <Row term="Para" value={program.audience} />
            <Row term="Fechas" value={dateRange(program.startDate, program.endDate)} />
            <Row term="Días en escuelas" value={String(program.schoolDays)} />
            <Row term="Escuelas" value={String(program.schoolCount)} />
            <LightBody>{program.overview}</LightBody>
            <Caption>{`Te llevas: ${program.takeaway}`}</Caption>
          </View>
        ))}
        <View style={styles.blockSpacer}>
          <Heading level={3}>La red en cifras</Heading>
          <Bullets items={COHORT_CLAIMS} />
          <Caption>{COHORT_ACCREDITATION}</Caption>
        </View>
      </LightSection>

      {/* ── Calendario ──────────────────────────────────────────────────── */}
      <LightSection heading="Calendario">
        {[inspira, mirada].map((program) => (
          <View key={program.id} style={styles.blockSpacer}>
            <Heading level={3}>{program.name}</Heading>
            {program.weeks.map((week) => (
              <Row
                key={week.id}
                term={week.label}
                value={`${dateRange(week.startDate, week.endDate)} · ${week.summary}`}
              />
            ))}
          </View>
        ))}
        <View style={styles.blockSpacer}>
          <Heading level={3}>Fin de semana libre, ambos programas</Heading>
          <LightBody>{COHORT_FREE_WEEKEND.label}</LightBody>
        </View>
      </LightSection>

      {/* ── Escuelas ────────────────────────────────────────────────────── */}
      <LightSection heading="Las escuelas">
        <Heading level={3}>{`${inspira.name} — inmersión`}</Heading>
        {inspira.immersionSchools.map((school) => (
          <Row
            key={school.name}
            term={school.name}
            value={`${formatDays(school.days)} días por pasante`}
          />
        ))}
        <View style={styles.blockSpacer}>
          <Heading level={3}>{`${inspira.name} — visitas`}</Heading>
          <LightBody>
            {`Cada cohorte visita ${inspira.visits.count} de estas ${inspira.visits.candidates.length} escuelas:`}
          </LightBody>
          <Bullets items={inspira.visits.candidates} />
          <Caption>{inspira.visits.selection}</Caption>
          <Caption>
            {`${joinEs(inspira.visits.fullDayOutside)} están fuera de ${COHORT_CITY} y toman el día completo.`}
          </Caption>
        </View>
        <View style={styles.blockSpacer}>
          <Heading level={3}>{mirada.name}</Heading>
          {mirada.schools.map((school) => (
            <Row
              key={school}
              term={school}
              value={`${formatDays(mirada.daysPerSchool)} días completos`}
            />
          ))}
          <Caption>{mirada.orderCaveat}</Caption>
        </View>
      </LightSection>

      {/* ── Mirada Profunda: antes, durante y después ───────────────────── */}
      <LightSection heading={`${mirada.name}: antes, durante y después`}>
        <Bullets
          items={[
            mirada.preparation,
            `${formatDayLong(mirada.closing.date)}: ${mirada.closing.text}`,
            mirada.followUp,
          ]}
        />
        <View style={styles.blockSpacer}>
          <Heading level={3}>Cómo es un día en las escuelas</Heading>
          <Bullets items={COHORT_DAY_STRUCTURE} />
        </View>
        <View style={styles.blockSpacer}>
          <Heading level={3}>Quién te recibe</Heading>
          {COHORT_HOSTS.map((host) => (
            <Row
              key={host.name}
              term={host.name}
              value={`${host.role}, ${host.school} · ${host.note}`}
            />
          ))}
        </View>
      </LightSection>

      {/* ── Inversión ───────────────────────────────────────────────────── */}
      <DarkSection heading="Inversión" showLogo>
        <ProgramInvestment program={inspira} />
        <ProgramInvestment program={mirada} />

        <View style={styles.blockSpacer}>
          <Row
            term="Pasaje aéreo (aproximado, por persona)"
            value={formatClp(FLIGHT_CLP_APPROX)}
            {...DARK_ROW}
          />
          <DarkBody>{LODGING_NOTE}</DarkBody>
          <DarkBody>{TOTALS_NOTE}</DarkBody>
        </View>

        <View style={styles.blockSpacer}>
          <Row term="Forma de pago" value={PAYMENT_TERMS} {...DARK_ROW} />
          <Row term="Cupos" value={PLACES_TERMS} {...DARK_ROW} />
        </View>

        <View style={styles.blockSpacer}>
          <DarkBody>{PRICE_VALIDITY}</DarkBody>
        </View>
      </DarkSection>

      {/* ── Valores por equipo ──────────────────────────────────────────── */}
      <LightSection heading="Valores por equipo">
        <LightBody>{TEAM_NOTE}</LightBody>
        <ProgramTeamTable program={inspira} />
        <ProgramTeamTable program={mirada} />
      </LightSection>

      {/* ── Incluye / no incluye ────────────────────────────────────────── */}
      <LightSection heading="Qué incluye" columns={2}>
        <LightColumn>
          <Heading level={3}>El programa incluye</Heading>
          <Bullets items={COHORT_INCLUDES} />
          <Bullets items={[inspira.lunches, mirada.lunches]} />
          <Bullets items={mirada.extraIncludes.map((item) => `${mirada.name}: ${item}`)} />
        </LightColumn>
        <LightColumn>
          <Heading level={3}>No incluye</Heading>
          <Bullets items={COHORT_EXCLUDES} />
        </LightColumn>
      </LightSection>

      {/* ── Contacto ────────────────────────────────────────────────────── */}
      <LightSection heading="Contacto">
        <LightBody>{`Coordinación e inscripciones, ${COHORT_LABEL}:`}</LightBody>
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
