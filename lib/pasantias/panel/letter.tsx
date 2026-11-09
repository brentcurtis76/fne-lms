/**
 * SERVER ONLY. The Carta de Invitación of the January 2027 Pasantías cohort,
 * one per traveller, as a PDF.
 *
 * The wording is FNE's template ("Carta Invitación", Instituto Relacional),
 * transcribed paragraph by paragraph. Four things vary per letter and nothing
 * else: the greeting and name, the school line, the lodging line, and the
 * program's own dates (INSPIRA ends on the 28th, Mirada Profunda on the 29th —
 * read from `cohort-public`, never typed here).
 *
 * The logo and the signature are NOT in this repository (it is public): they
 * are uploaded once through the panel into the private bucket and passed in.
 */
import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { FONTS } from '../../propuestas/styles';
import '../../propuestas/fonts';
import { programById, type ProgramId } from '../cohort-public';
import { SALUTATION_LABELS, type Salutation } from './types';

export const LETTER_VERSION = 'carta-invitacion-2026-11-v1';

export const LETTER_SIGNER = {
  name: 'Arnoldo Cisternas',
  title: 'Director & Fundador',
  organization: 'Instituto Relacional',
  cities: 'Barcelona - Santiago - Madrid',
} as const;

/** The template's own example values, offered as a starting point in the panel. */
export const LETTER_LODGING_EXAMPLE =
  'la Residencia/Hotel Martí Codolar, ubicada en Av. del Cardenal Vidal i Barraquer, 15, Horta-Guinardó';
export const LETTER_SCHOOL_EXAMPLE = 'del Colegio Ejemplo de Valdivia, de la Región de Los Ríos, Chile';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function parts(iso: string): { day: number; month: string; year: string } {
  const [year, month, day] = iso.split('-');
  return { day: Number(day), month: MONTHS_ES[Number(month) - 1], year };
}

/** `entre el 18 y el 28 de enero de 2027`, from the program's own dates. */
export function letterDateRange(programId: ProgramId): string {
  const { startDate, endDate } = programById(programId);
  const start = parts(startDate);
  const end = parts(endDate);
  if (start.month === end.month && start.year === end.year) {
    return `entre el ${start.day} y el ${end.day} de ${end.month} de ${end.year}`;
  }
  const startYear = start.year === end.year ? '' : ` de ${start.year}`;
  return `entre el ${start.day} de ${start.month}${startYear} y el ${end.day} de ${end.month} de ${end.year}`;
}

export interface LetterText {
  salutation: Salutation;
  fullName: string;
  /** Completes "como parte del equipo …", e.g. "del Colegio X, de la Región de Y, Chile". */
  schoolLine: string;
  /** Completes "Usted se estará hospedando en …", e.g. "la Residencia Z, ubicada en …". */
  lodgingLine: string;
  program: ProgramId;
}

function withoutFinalStop(text: string): string {
  return text.replace(/[.\s]+$/, '');
}

/** The greeting and the four body paragraphs, in order. Pure — unit tested. */
export function letterParagraphs(input: LetterText): { greeting: string; body: string[] } {
  return {
    greeting: `${SALUTATION_LABELS[input.salutation]} ${input.fullName}`,
    body: [
      `Es un placer para mí extenderle, como parte del equipo ${withoutFinalStop(input.schoolLine)}, una cordial ` +
        'invitación a participar en una pasantía educativa en escuelas de vanguardia en Barcelona, organizada por ' +
        `El Instituto Relacional de España. Dicha pasantía se llevará a cabo ${letterDateRange(input.program)}.`,
      `Usted se estará hospedando en ${withoutFinalStop(input.lodgingLine)}.`,
      'Este programa de formación ofrece una oportunidad única para adquirir experiencia práctica en un ambiente ' +
        'académico de vanguardia educativa, especializado en aprendizaje activo, plan de acompañamiento vital para ' +
        'el estudiante e innovación pedagógica. Durante su estancia, tendrá la oportunidad de trabajar con ' +
        'profesionales experimentados y aprender de sus conocimientos y habilidades en estas áreas.',
      'Las escuelas que forman parte de la red de Futuros De La Educación son instituciones líderes en su campo, ' +
        'con una filosofía educativa centrada en el desarrollo integral del estudiante. El Instituto Relacional de ' +
        'España está dedicado desde el año 2015 al desarrollo y cambio cultural en organizaciones educativas. Por ' +
        'favor, no dude en ponerse en contacto conmigo si necesita más información sobre la pasantía. Estamos ' +
        'deseando darle la bienvenida a nuestro programa de formación y esperamos que disfrute de su experiencia ' +
        'con nosotros.',
    ],
  };
}

/** `Carta Invitación - Ana Pérez.pdf` — the display name of the stored letter. */
export function letterFileName(fullName: string): string {
  const cleaned = fullName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `Carta Invitación - ${cleaned}.pdf`;
}

export interface LetterImageInput {
  data: Buffer;
  format: 'png' | 'jpg';
}

export interface LetterInput extends LetterText {
  logo: LetterImageInput;
  signature: LetterImageInput;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 72,
    fontFamily: FONTS.family,
    fontSize: 10,
    lineHeight: 1.45,
    color: '#111827',
  },
  logo: { width: 170, height: 96, objectFit: 'contain', objectPosition: 'left', marginBottom: 40 },
  greeting: { marginBottom: 6 },
  paragraph: { marginTop: 14, textAlign: 'justify' },
  closing: { marginTop: 28 },
  signature: { width: 110, height: 72, objectFit: 'contain', objectPosition: 'left', marginTop: 4 },
  signerName: { marginTop: 2 },
  signerLine: { marginTop: 1 },
});

function LetterDocument({ input }: { input: LetterInput }) {
  const text = letterParagraphs(input);
  return (
    <Document title={`Carta de invitación — ${input.fullName}`} author={LETTER_SIGNER.organization} language="es-CL">
      <Page size="LETTER" style={styles.page}>
        <Image src={input.logo} style={styles.logo} />
        <Text style={styles.greeting}>{text.greeting}</Text>
        {text.body.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
        <View wrap={false}>
          <Text style={styles.closing}>Atentamente,</Text>
          <Image src={input.signature} style={styles.signature} />
          <Text style={styles.signerName}>{LETTER_SIGNER.name}</Text>
          <Text style={styles.signerLine}>{LETTER_SIGNER.title}</Text>
          <Text style={styles.signerLine}>{LETTER_SIGNER.organization}</Text>
          <Text style={styles.signerLine}>{LETTER_SIGNER.cities}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvitationLetter(input: LetterInput): Promise<Buffer> {
  try {
    return await renderToBuffer(<LetterDocument input={input} />);
  } catch (err) {
    // The message of a render failure may quote the document's text: keep only the kind.
    const kind = err instanceof Error ? err.name : 'Error';
    throw new Error(`Invitation letter render failed (${LETTER_VERSION}): ${kind}`);
  }
}
