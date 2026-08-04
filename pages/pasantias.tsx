/**
 * `/pasantias` — the public landing page for Pasantías INSPIRA Barcelona.
 *
 * D-01/D-02: every cohort fact on this page comes from `cohort-public.ts` and
 * nothing else. `cohort-commercial.ts` is server-only and must never be imported
 * here — `scripts/check-price-leak.mjs` fails the build if it ever is. There are
 * no prices on this page at all; the ficha it links to carries none either.
 *
 * A6a ships every section except the lead form: the `#programa` panel is an
 * interim mailto CTA that A6b replaces with the real `LeadForm` (see the marker
 * comment on that section). Links from the rest of the site land in A7a.
 */
import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Footer from '../components/Footer';
import { getAppBaseUrl } from '../lib/utils/app-url';
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
} from '../lib/pasantias/cohort-public';

const CONTACT_EMAIL = 'info@nuevaeducacion.org';

/**
 * es-CL writes the decimal separator as a comma. Done by hand rather than with
 * `toLocaleString` because this runs on both sides of hydration and a browser
 * without es-CL locale data would render `2.5` where the server rendered `2,5`.
 */
function formatDays(days: number): string {
  return String(days).replace('.', ',');
}

/** Appendix A-11. `wa.me` wants the number with no punctuation. */
const WHATSAPP_NUMBER = '56941623577';
const WHATSAPP_DISPLAY = '+56 9 4162 3577';
const WHATSAPP_MESSAGE = `Hola, quiero información sobre las Pasantías INSPIRA Barcelona (${COHORT_LABEL}).`;
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

const FICHA_HREF = '/api/pasantias/ficha';

const PROGRAMA_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  `Programa completo — Pasantías INSPIRA Barcelona ${COHORT_LABEL}`
)}&body=${encodeURIComponent(
  'Hola:\n\nQuiero recibir el programa completo de las Pasantías INSPIRA Barcelona.\n\nNombre:\nColegio o institución:\nCargo:\nTeléfono:\n'
)}`;

const PAGE_PATH = '/pasantias';
const OG_IMAGE_PATH = '/barcelona-skyline.jpg';
const PAGE_TITLE = `Pasantías INSPIRA Barcelona · ${COHORT_HEADLINE} | Fundación Nueva Educación`;
const PAGE_DESCRIPTION = `Dos semanas viviendo escuelas de vanguardia en Barcelona: ${COHORT_VISIT_DAY_COUNT} días de visitas en ${COHORT_SCHOOLS.length} escuelas, con inmersión completa en Escola Virolai y Escola Sadako.`;

interface PasantiasPageProps {
  /** Absolute URL of this page, for the OG/Twitter unfurl. */
  canonicalUrl: string;
  /** Absolute URL of the share image. */
  ogImageUrl: string;
  /** es-CL date range per week of {@link COHORT_WEEKS}, same order. */
  weekRanges: string[];
  /** es-CL date of each free day of {@link COHORT_FREE_DAYS}, same order. */
  freeDayDates: string[];
}

/**
 * Server-side only. Calendar dates are formatted in UTC so the string never
 * shifts with the runtime's timezone, and they are computed here rather than in
 * render so a browser without es-CL locale data cannot produce a hydration
 * mismatch.
 */
function formatDayMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The page's own absolute origin.
 *
 * `getAppBaseUrl` is the repo's authority and is used first. It throws when a
 * production build runs outside Vercel with no configured origin — which is
 * exactly the CI e2e server (`npm run start`) — and a marketing page must not
 * 500 there, so that one case falls back to the request's own host. Nothing
 * durable is minted from this value: it only fills this page's own meta tags.
 */
function resolveOrigin(req: { headers?: { host?: string | string[] } }): string {
  try {
    return getAppBaseUrl(req);
  } catch {
    const rawHost = req?.headers?.host;
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    if (!host) {
      return 'http://localhost:3000';
    }
    return `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
  }
}

export const getServerSideProps: GetServerSideProps<PasantiasPageProps> = async (context) => {
  const origin = resolveOrigin(context.req);

  return {
    props: {
      canonicalUrl: `${origin}${PAGE_PATH}`,
      ogImageUrl: `${origin}${OG_IMAGE_PATH}`,
      weekRanges: COHORT_WEEKS.map(
        (week) => `${formatDayMonth(week.startDate)} al ${formatDayMonth(week.endDate)}`
      ),
      freeDayDates: COHORT_FREE_DAYS.map((freeDay) => formatDayMonth(freeDay.date)),
    },
  };
};

const SECTION_LABEL = 'mb-3 text-[12px] font-semibold uppercase tracking-[.14em] text-brand_gray_medium';
const SECTION_TITLE = 'text-[28px] font-black uppercase leading-[1.05] tracking-[-.015em] sm:text-[38px]';
const CARD = 'rounded-2xl border border-gray-200 bg-white p-6 sm:p-8';

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

export default function PasantiasPage({
  canonicalUrl,
  ogImageUrl,
  weekRanges,
  freeDayDates,
}: PasantiasPageProps) {
  const [immersionWeek, visitWeek] = COHORT_WEEKS;

  const faqs: FaqItem[] = [
    {
      question: '¿Quiénes participan en la pasantía?',
      answer: (
        <>
          Equipos directivos, docentes y líderes de comunidades educativas que están conduciendo
          procesos de cambio en sus colegios. Si tienes dudas sobre tu caso, escríbenos a{' '}
          <a className="underline hover:no-underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </>
      ),
    },
    {
      question: '¿Qué incluye el programa?',
      answer: (
        <>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {COHORT_INCLUDES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 font-semibold">No incluye:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {COHORT_EXCLUDES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ),
    },
    {
      question: '¿Cómo es el alojamiento?',
      answer: (
        <>
          El alojamiento en {COHORT_LODGING_AREA} va aparte del programa y se coordina con el equipo
          de FNE según tu preferencia. Te acompañamos en la elección y en la reserva.
        </>
      ),
    },
    {
      question: '¿Qué pasa el fin de semana largo?',
      answer: (
        <>
          Entre ambas semanas quedan {COHORT_FREE_DAYS.length} días libres. El{' '}
          {freeDayDates[freeDayDates.length - 1]} es Fiesta Nacional de España y los colegios están
          cerrados: es tiempo para descansar, recorrer Barcelona o conocer Europa.
        </>
      ),
    },
    {
      question: '¿Podemos ir como delegación de un colegio?',
      answer: (
        <>
          Sí. Para cotizaciones grupales escríbenos por el{' '}
          <Link className="underline hover:no-underline" href="/#contacto">
            formulario de contacto
          </Link>{' '}
          o a{' '}
          <a className="underline hover:no-underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          y coordinamos una propuesta para tu equipo.
        </>
      ),
    },
    {
      question: '¿Cómo reservo mi cupo?',
      answer: (
        <>
          Solicita el programa completo más abajo. El equipo de FNE te contacta con la disponibilidad
          de la cohorte {COHORT_LABEL} y los pasos para confirmar tu participación.
        </>
      ),
    },
  ];

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Fundación Nueva Educación" />
        <meta property="og:locale" content="es_CL" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:alt" content="Barcelona, sede de las Pasantías INSPIRA" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <header className="border-b border-gray-200 bg-white" data-testid="pasantias-header">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center" data-testid="pasantias-home-link">
            <img src="/Logo BW.png?v=3" alt="Fundación Nueva Educación" className="h-9 w-auto" />
          </Link>
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-brand_primary px-4 py-2 text-[13px] font-semibold text-brand_primary transition-colors hover:bg-brand_primary hover:text-white"
            data-testid="pasantias-header-whatsapp"
          >
            Escríbenos por WhatsApp
          </a>
        </div>
      </header>

      <main className="bg-white text-brand_primary">
        {/* ============ Hero ============ */}
        <section className="bg-brand_primary text-white" data-testid="pasantias-hero">
          <div className="mx-auto grid max-w-[1040px] gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div>
              <p className="mb-4 text-[12px] font-semibold uppercase tracking-[.14em] text-brand_accent">
                Pasantías INSPIRA · Barcelona
              </p>
              <h1 className="m-0 font-black uppercase leading-[.98] tracking-[-.015em] text-[clamp(34px,8vw,56px)]">
                Vive una escuela
                <br />
                por dentro,
                <br />
                <span className="text-brand_accent">no la visites</span>
              </h1>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <span
                  className="rounded-full bg-brand_accent px-5 py-2 text-[15px] font-bold text-brand_primary"
                  data-testid="pasantias-date-chip"
                >
                  {COHORT_HEADLINE}
                </span>
                <span
                  className="rounded-full border border-white/25 px-5 py-2 text-[15px] font-medium text-white/85"
                  data-testid="pasantias-hero-stats"
                >
                  {COHORT_VISIT_DAY_COUNT} días de visitas · {COHORT_SCHOOLS.length} escuelas
                </span>
              </div>

              <p className="mt-7 max-w-[520px] text-[17px] leading-[1.6] text-white/[0.72]">
                Dos semanas dentro de las escuelas que están cambiando la educación en Cataluña:
                una semana de inmersión completa y una semana de visitas, con talleres cada tarde
                junto a quienes las dirigen.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#programa"
                  className="inline-flex items-center justify-center rounded-full bg-brand_accent px-8 py-4 font-semibold text-brand_primary transition-colors hover:bg-brand_accent_hover"
                  data-testid="pasantias-cta-programa"
                >
                  Solicita el programa completo
                </a>
                <a
                  href={FICHA_HREF}
                  className="inline-flex items-center justify-center rounded-full border border-white/40 px-8 py-4 font-semibold text-white transition-colors hover:bg-white hover:text-brand_primary"
                  data-testid="pasantias-cta-ficha"
                >
                  Descarga la ficha (PDF)
                </a>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl">
              <img
                src="/barcelona-skyline.jpg"
                alt="Vista de Barcelona"
                className="h-full max-h-[420px] w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        {/* ============ Por qué Barcelona ============ */}
        <section
          className="mx-auto max-w-[1040px] px-6 py-16 sm:py-20"
          aria-labelledby="barcelona-title"
          data-testid="pasantias-barcelona"
        >
          <p className={SECTION_LABEL}>Por qué Barcelona</p>
          <h2 id="barcelona-title" className={SECTION_TITLE}>
            Un ecosistema, no una escuela suelta
          </h2>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="space-y-4 text-[17px] leading-[1.65] text-brand_gray_dark">
              <p>
                Cataluña lleva años sosteniendo una transformación educativa en red: escuelas muy
                distintas entre sí que comparten preguntas, herramientas y una manera de mirar al
                estudiante. Por eso la pasantía no es un tour por un colegio ejemplar, sino un
                recorrido por un ecosistema que se explica a sí mismo.
              </p>
              <p>
                Vas a entrar a las aulas, conversar con los equipos directivos, entrevistar a
                estudiantes y docentes, y cerrar cada día con un taller que ordena lo que viste.
              </p>
              <ul className="flex flex-wrap gap-3 pt-2">
                {COHORT_CLAIMS.map((claim, index) => (
                  <li
                    key={claim}
                    className="rounded-full bg-gray-100 px-4 py-2 text-[14px] font-semibold text-brand_gray_dark"
                    data-testid={`pasantias-claim-${index}`}
                  >
                    {claim}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl">
              <img
                src="/barcelona-innovation.jpg"
                alt="Trabajo en aula durante una pasantía en Barcelona"
                className="h-full max-h-[360px] w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        {/* ============ Dos semanas, dos modos ============ */}
        <section
          className="bg-gray-50 py-16 sm:py-20"
          aria-labelledby="modos-title"
          data-testid="pasantias-modos"
        >
          <div className="mx-auto max-w-[1040px] px-6">
            <p className={SECTION_LABEL}>El corazón del programa</p>
            <h2 id="modos-title" className={SECTION_TITLE}>
              Dos semanas, dos modos
            </h2>
            <p className="mt-5 max-w-[720px] text-[17px] leading-[1.65] text-brand_gray_dark">
              Primero te quedas. Después recorres. Ese orden es deliberado: la semana de inmersión
              te da el tiempo suficiente para entender cómo funciona una escuela por dentro, y la
              semana de visitas te muestra cuántas formas distintas puede tomar la misma convicción.
            </p>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <article className={`${CARD} border-brand_primary`} data-testid="pasantias-week-semana-1">
                <p className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand_gray_medium">
                  {weekRanges[0]}
                </p>
                <h3 className="mt-2 text-[22px] font-bold tracking-[-.01em]">{immersionWeek.label}</h3>
                <p className="mt-3 text-[16px] leading-[1.6] text-brand_gray_dark">
                  {immersionWeek.summary}
                </p>
                <p className="mt-5 text-[14px] font-semibold uppercase tracking-[.08em] text-brand_gray_medium">
                  {immersionWeek.visitDays.length} días de visitas
                </p>
                <ul className="mt-4 space-y-3">
                  {COHORT_IMMERSION_SCHOOLS.map((school) => (
                    <li
                      key={school.name}
                      className="flex items-baseline justify-between gap-4 border-t border-gray-200 pt-3"
                    >
                      <span className="font-semibold">{school.name}</span>
                      <span className="shrink-0 text-[14px] text-brand_gray_medium">
                        {formatDays(school.immersionDays ?? 0)} días
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[15px] leading-[1.6] text-brand_gray_dark">
                  No vas de visita: entras con el equipo, sigues su rutina y te quedas el tiempo
                  necesario para ver cómo se sostiene el proyecto un día cualquiera.
                </p>
              </article>

              <article className={CARD} data-testid="pasantias-week-semana-2">
                <p className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand_gray_medium">
                  {weekRanges[1]}
                </p>
                <h3 className="mt-2 text-[22px] font-bold tracking-[-.01em]">{visitWeek.label}</h3>
                <p className="mt-3 text-[16px] leading-[1.6] text-brand_gray_dark">
                  {visitWeek.summary}
                </p>
                <p className="mt-5 text-[14px] font-semibold uppercase tracking-[.08em] text-brand_gray_medium">
                  {visitWeek.visitDays.length} días de visitas
                </p>
                <ul className="mt-4 space-y-3">
                  {COHORT_VISIT_SCHOOLS.map((school) => (
                    <li
                      key={school.name}
                      className="flex items-baseline justify-between gap-4 border-t border-gray-200 pt-3"
                    >
                      <span className="font-semibold">{school.name}</span>
                      {school.fullDay && (
                        <span className="shrink-0 text-[14px] text-brand_gray_medium">
                          día completo
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[15px] leading-[1.6] text-brand_gray_dark">
                  Cinco proyectos distintos en cuatro días. El orden de las visitas puede variar
                  según la agenda de cada escuela.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ============ El fin de semana largo ============ */}
        <section
          className="mx-auto max-w-[1040px] px-6 py-16 sm:py-20"
          aria-labelledby="finde-title"
          data-testid="pasantias-finde"
        >
          <p className={SECTION_LABEL}>Entre ambas semanas</p>
          <h2 id="finde-title" className={SECTION_TITLE}>
            Un fin de semana largo, a propósito
          </h2>
          <p className="mt-5 max-w-[720px] text-[17px] leading-[1.65] text-brand_gray_dark">
            Tres días sin agenda en la mitad del viaje. Sirven para que lo aprendido se asiente, para
            recorrer Barcelona o para conocer Europa antes de la segunda semana.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {COHORT_FREE_DAYS.map((freeDay, index) => (
              <li
                key={freeDay.date}
                className="rounded-2xl bg-gray-50 p-6"
                data-testid={`pasantias-free-day-${index}`}
              >
                <p className="text-[13px] font-semibold uppercase tracking-[.1em] text-brand_gray_medium">
                  {freeDayDates[index]}
                </p>
                <p className="mt-2 text-[16px] font-medium leading-[1.5]">{freeDay.label}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ============ Cómo es un día ============ */}
        <section
          className="bg-brand_primary py-16 text-white sm:py-20"
          aria-labelledby="dia-title"
          data-testid="pasantias-dia-tipo"
        >
          <div className="mx-auto max-w-[1040px] px-6">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[.14em] text-brand_accent">
              Día tipo
            </p>
            <h2 id="dia-title" className={SECTION_TITLE}>
              Cómo es un día
            </h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {COHORT_DAY_STRUCTURE.map((block, index) => (
                <li
                  key={block.label}
                  className="rounded-2xl border border-white/15 bg-white/[0.04] p-6"
                  data-testid={`pasantias-day-block-${index}`}
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand_accent font-bold text-brand_primary">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-[18px] font-bold">{block.label}</h3>
                  <p className="mt-2 text-[15px] leading-[1.6] text-white/[0.72]">
                    {block.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ============ Las escuelas ============ */}
        <section
          className="mx-auto max-w-[1040px] px-6 py-16 sm:py-20"
          aria-labelledby="escuelas-title"
          data-testid="pasantias-escuelas"
        >
          <p className={SECTION_LABEL}>La red</p>
          <h2 id="escuelas-title" className={SECTION_TITLE}>
            Las {COHORT_SCHOOLS.length} escuelas
          </h2>
          <p className="mt-5 max-w-[720px] text-[17px] leading-[1.65] text-brand_gray_dark">
            Dos escuelas te reciben la semana completa. Cinco más abren sus puertas en la segunda
            semana.
          </p>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[.12em] text-brand_gray_medium">
                Escuelas de inmersión
              </h3>
              <ul className="mt-4 space-y-3">
                {COHORT_IMMERSION_SCHOOLS.map((school, index) => (
                  <li
                    key={school.name}
                    className="rounded-xl border-2 border-brand_primary p-5"
                    data-testid={`pasantias-school-inmersion-${index}`}
                  >
                    <p className="text-[17px] font-bold">{school.name}</p>
                    <p className="mt-1 text-[15px] text-brand_gray_medium">
                      {formatDays(school.immersionDays ?? 0)} días de inmersión por pasante
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[.12em] text-brand_gray_medium">
                Escuelas de visita
              </h3>
              <ul className="mt-4 space-y-3">
                {COHORT_VISIT_SCHOOLS.map((school, index) => (
                  <li
                    key={school.name}
                    className="rounded-xl border border-gray-200 p-5"
                    data-testid={`pasantias-school-visita-${index}`}
                  >
                    <p className="text-[17px] font-bold">{school.name}</p>
                    <p className="mt-1 text-[15px] text-brand_gray_medium">
                      {school.fullDay
                        ? 'Día completo — fuera de Barcelona'
                        : 'Visita de media jornada'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ============ El equipo ============ */}
        <section
          className="bg-gray-50 py-16 sm:py-20"
          aria-labelledby="equipo-title"
          data-testid="pasantias-equipo"
        >
          <div className="mx-auto max-w-[1040px] px-6">
            <p className={SECTION_LABEL}>Quiénes te reciben</p>
            <h2 id="equipo-title" className={SECTION_TITLE}>
              El equipo
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {COHORT_EXPERTS.map((expert, index) => (
                <li
                  key={expert.name}
                  className="rounded-2xl bg-white p-6"
                  data-testid={`pasantias-expert-${index}`}
                >
                  <p className="text-[17px] font-bold leading-[1.25]">{expert.name}</p>
                  <p className="mt-2 text-[15px] leading-[1.5] text-brand_gray_dark">{expert.role}</p>
                  {expert.school && (
                    <p className="mt-1 text-[14px] text-brand_gray_medium">{expert.school}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ Qué te llevas — los 13 objetivos ============ */}
        <section
          className="mx-auto max-w-[1040px] px-6 py-16 sm:py-20"
          aria-labelledby="objetivos-title"
          data-testid="pasantias-objetivos"
        >
          <p className={SECTION_LABEL}>Qué te llevas</p>
          <h2 id="objetivos-title" className={SECTION_TITLE}>
            Los objetivos de la pasantía
          </h2>
          <p className="mt-5 max-w-[720px] text-[17px] leading-[1.65] text-brand_gray_dark">
            Son {COHORT_OBJECTIVES.length}. Cada uno corresponde a algo que vas a ver funcionando en
            terreno, no a una promesa general.
          </p>
          <ol className="mt-10 grid gap-x-8 gap-y-6 md:grid-cols-2">
            {COHORT_OBJECTIVES.map((objective, index) => (
              <li
                key={objective}
                className="flex gap-4 border-t border-gray-200 pt-5"
                data-testid={`pasantias-objective-${index}`}
              >
                <span className="shrink-0 text-[15px] font-black tabular-nums text-brand_accent_hover">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="text-[15px] leading-[1.6] text-brand_gray_dark">{objective}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ============ FAQ ============ */}
        <section
          className="bg-gray-50 py-16 sm:py-20"
          aria-labelledby="faq-title"
          data-testid="pasantias-faq"
        >
          <div className="mx-auto max-w-[820px] px-6">
            <p className={SECTION_LABEL}>Preguntas frecuentes</p>
            <h2 id="faq-title" className={SECTION_TITLE}>
              Antes de decidir
            </h2>
            <dl className="mt-10 space-y-6">
              {faqs.map((faq, index) => (
                <div
                  key={faq.question}
                  className="rounded-2xl bg-white p-6 sm:p-7"
                  data-testid={`pasantias-faq-${index}`}
                >
                  <dt className="text-[17px] font-bold">{faq.question}</dt>
                  <dd className="mt-3 text-[15px] leading-[1.65] text-brand_gray_dark">
                    {faq.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/*
          ============ #programa — INTERIM PANEL, REPLACED IN A6b ============
          A6b swaps this whole <section> for `components/pasantias/LeadForm.tsx`.
          Keep the `id="programa"` anchor and the section boundary intact so the
          hero CTA and every other link keep working across that swap.
        */}
        <section
          id="programa"
          className="scroll-mt-8 bg-brand_primary py-16 text-white sm:py-20"
          aria-labelledby="programa-title"
          data-testid="pasantias-programa"
        >
          <div className="mx-auto max-w-[820px] px-6 text-center">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[.14em] text-brand_accent">
              Cohorte {COHORT_LABEL}
            </p>
            <h2 id="programa-title" className={SECTION_TITLE}>
              Solicita el programa completo
            </h2>
            <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-[1.6] text-white/[0.72]">
              Escríbenos y te enviamos el programa detallado de la cohorte {COHORT_HEADLINE}, con el
              itinerario, las escuelas y las condiciones de participación.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={PROGRAMA_MAILTO}
                className="inline-flex items-center justify-center rounded-full bg-brand_accent px-8 py-4 font-semibold text-brand_primary transition-colors hover:bg-brand_accent_hover"
                data-testid="pasantias-cta-mailto"
              >
                Escríbenos a {CONTACT_EMAIL}
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-white/40 px-8 py-4 font-semibold text-white transition-colors hover:bg-white hover:text-brand_primary"
                data-testid="pasantias-cta-whatsapp"
              >
                WhatsApp {WHATSAPP_DISPLAY}
              </a>
            </div>
            <p className="mt-6 text-[14px] text-white/60">
              ¿Prefieres revisarlo primero?{' '}
              <a className="underline hover:no-underline" href={FICHA_HREF}>
                Descarga la ficha en PDF
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
