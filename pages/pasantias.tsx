/**
 * `/pasantias` — the public landing page for Pasantías INSPIRA Barcelona.
 *
 * A6r ports the externally-authored redesign delivered under
 * `docs/plan/design/a6r-handoff/`. The delivered mockup has every fact inlined,
 * which is correct for a mockup and is exactly the rot this phase exists to
 * prevent: **no cohort fact is written in this file**. Dates, weeks, schools,
 * levels, highlights, experts, claims, objectives, the day structure and the
 * inclusion lists all come from `lib/pasantias/cohort-public.ts`, and
 * `__tests__/pages/pasantias-hardcoded-cohort.test.ts` fails on any of those
 * strings appearing as a literal here.
 *
 * D-01/D-02: `cohort-commercial.ts` is server-only and must never be imported
 * here — `scripts/check-price-leak.mjs` fails the build if it ever is. There are
 * no prices on this page at all; the ficha it links to carries none either.
 *
 * The `#programa` panel is still A6a's interim mailto CTA. The mockup delivered
 * a full request form; **A6b owns the form's behaviour**, so this round ports
 * the section's visual treatment only rather than shipping inputs that look live
 * and submit nowhere.
 */
import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Footer from '../components/Footer';
import { getAppBaseUrl } from '../lib/utils/app-url';
import type { CohortSchool } from '../lib/pasantias/cohort-public';
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

/**
 * The design renders each claim as a large figure over a small caption, which
 * the module stores as one string ("<figure> <what it counts>"). Split on the
 * first space rather than restating either half here.
 */
function splitClaim(claim: string): { figure: string; caption: string } {
  const [figure, ...rest] = claim.split(' ');
  return { figure, caption: rest.join(' ') };
}

/**
 * The immersion tier currently gives every school the same number of days, which
 * is what lets the section head say "cada una". Derived rather than assumed: if
 * a future cohort splits the week unevenly this collapses to `null` and the
 * phrase disappears instead of quietly printing one school's figure for both.
 */
const UNIFORM_IMMERSION_DAYS: number | null = (() => {
  const distinct = new Set(COHORT_IMMERSION_SCHOOLS.map((school) => school.immersionDays ?? 0));
  return distinct.size === 1 ? [...distinct][0] : null;
})();

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
const PAGE_TITLE = `Pasantías INSPIRA Barcelona · ${COHORT_HEADLINE} | Fundación Nueva Educación`;
const PAGE_DESCRIPTION = `Dos semanas viviendo escuelas de vanguardia en Barcelona: ${COHORT_VISIT_DAY_COUNT} días de visitas en ${
  COHORT_SCHOOLS.length
} escuelas, con inmersión completa en ${COHORT_IMMERSION_SCHOOLS.map((school) => school.name).join(
  ' y '
)}.`;

/**
 * The site header, replicated so `/pasantias` reads as part of
 * nuevaeducacion.org rather than as a stray landing page. Destinations are the
 * routes this repository actually serves — the mockup pointed at `/contacto`
 * and at the platform's public hostname, neither of which resolves here.
 */
const NAV_LINKS: ReadonlyArray<{ label: string; href: string; current?: boolean }> = [
  { label: 'Pasantías', href: PAGE_PATH, current: true },
  { label: 'Programas', href: '/programas' },
  { label: 'Noticias y eventos', href: '/noticias' },
  { label: 'Nosotros', href: '/nosotros' },
  { label: 'Contacto', href: '/#contacto' },
];
const HUB_LINK = { label: 'Hub de transformación', href: '/login' };

/**
 * Photography slots from the delivered design, each with the filenames that may
 * fill it, best first. The design names the photographs it wants; the repository
 * currently holds three shippable ones under their own names, so each slot lists
 * the design's name and then whatever stands in for it today. A slot that
 * resolves to nothing is not rendered at all — see {@link PhotoBreak}.
 *
 * Dropping `hero-barcelona.jpg` into `public/images/pasantias/` is therefore the
 * whole of "add the real photo": no code changes with it.
 */
const PHOTO_SLOTS = {
  hero: ['hero-barcelona', 'bcn-skyline'],
  escuelaInterior: ['escuela-interior', 'pasantes-virolai'],
  barcelonaCalle: ['barcelona-calle'],
  equipoConversando: ['equipo-conversando', 'educadores-biblioteca'],
  barcelonaTarde: ['barcelona-tarde'],
} as const;

type PhotoSlot = keyof typeof PHOTO_SLOTS;

interface PasantiasPageProps {
  /** Absolute URL of this page, for the OG/Twitter unfurl. */
  canonicalUrl: string;
  /** Absolute URL of the share image. */
  ogImageUrl: string;
  /** es-CL date range per week of {@link COHORT_WEEKS}, same order. */
  weekRanges: string[];
  /** es-CL date of each free day of {@link COHORT_FREE_DAYS}, same order. */
  freeDayDates: string[];
  /** Resolved `/images/...` URL per slot, or `null` when nothing fills it yet. */
  photos: Record<PhotoSlot, string | null>;
  /** Resolved portrait URL per expert of {@link COHORT_EXPERTS}, same order. */
  portraits: (string | null)[];
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
 * Portrait filenames are derived from the expert's name in the module, never
 * listed here: a lookup table keyed by name would put eight cohort strings back
 * into this file, which is the thing [A1] forbids.
 */
function portraitSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

/**
 * `getAppBaseUrl` is called directly and is allowed to throw.
 *
 * Round r1 wrapped it in a try/catch that rebuilt the origin from the request's
 * `Host` header, arguing that nothing durable was minted because the value only
 * fills meta tags. **That argument was wrong**, and the PM's acceptance of it
 * was withdrawn in r3: `<link rel="canonical">` and the OG URL are scraped,
 * cached and indexed by search engines and by WhatsApp, so a poisoned origin
 * outlives the request exactly the way `lib/utils/app-url.ts` warns about — the
 * artifact just happens to live in someone else's cache instead of an .ics file.
 *
 * The real problem the catch was papering over is that CI's `npm run start`
 * runs a production build with no configured origin. That is fixed where it
 * belongs: `.github/workflows/ci.yml` writes `NEXT_PUBLIC_BASE_URL` into the
 * `.env.local` it already generates for the e2e stack.
 */
export const getServerSideProps: GetServerSideProps<PasantiasPageProps> = async (context) => {
  const origin = getAppBaseUrl(context.req);

  // Imported here rather than at module scope: this is the only server-side
  // consumer, and a dynamic import keeps `node:fs` out of the page's module
  // graph no matter how the bundler decides to treat the file.
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const publicDir = join(process.cwd(), 'public');
  const resolveImage = (directory: string, basenames: readonly string[]): string | null => {
    for (const basename of basenames) {
      for (const extension of IMAGE_EXTENSIONS) {
        const relative = `${directory}/${basename}${extension}`;
        if (existsSync(join(publicDir, relative))) return `/${relative}`;
      }
    }
    return null;
  };

  const photos = Object.fromEntries(
    (Object.keys(PHOTO_SLOTS) as PhotoSlot[]).map((slot) => [
      slot,
      resolveImage('images/pasantias', PHOTO_SLOTS[slot]),
    ])
  ) as Record<PhotoSlot, string | null>;

  const portraits = COHORT_EXPERTS.map((expert) =>
    resolveImage('images/pasantias/equipo', [portraitSlug(expert.name)])
  );

  // The share image is the hero, so the two can never disagree; the fallback is
  // the site-wide Barcelona asset for the case where no hero photo is present.
  const ogImagePath = photos.hero ?? '/images/pasantias/bcn-skyline.jpg';

  return {
    props: {
      canonicalUrl: `${origin}${PAGE_PATH}`,
      ogImageUrl: `${origin}${ogImagePath}`,
      weekRanges: COHORT_WEEKS.map(
        (week) => `${formatDayMonth(week.startDate)} al ${formatDayMonth(week.endDate)}`
      ),
      freeDayDates: COHORT_FREE_DAYS.map((freeDay) => formatDayMonth(freeDay.date)),
      photos,
      portraits,
    },
  };
};

/* ---------------------------------------------------------------- design system
   Class strings for the grammar the handoff repeats on every section: a 1280 px
   shell, an eyebrow, an extra-bold title and the manual's filete dorado. Sizes
   and tracking come from `styles/fne-tokens.css`; the two rule dimensions are
   read as custom properties so the token file stays the single source. */

const SHELL = 'mx-auto w-full max-w-[1280px] px-5 sm:px-6 lg:px-8';
const SECTION_PAD = 'py-16 md:py-24 lg:py-[120px]';
const EYEBROW = 'block text-[11px] font-semibold uppercase tracking-[.15em]';
const SECTION_TITLE =
  'm-0 text-[clamp(28px,4.4vw,44px)] font-extrabold leading-[1.1] tracking-[-.015em]';
const GOLD_RULE =
  'mt-4 block h-[var(--rule-height)] w-[var(--rule-width)] rounded-sm bg-gold-gradient';
const CARD_LIGHT = 'rounded-2xl border border-gray-200 bg-white p-6 sm:p-8';
const CARD_DARK = 'rounded-2xl bg-brand_primary p-6 text-white sm:p-8';
const BUTTON_BASE =
  'inline-flex h-[52px] items-center justify-center rounded-lg px-6 text-[15px] font-semibold tracking-[.08em] transition-colors duration-200';
const BUTTON_ACCENT = `${BUTTON_BASE} border border-brand_accent bg-brand_accent text-brand_primary hover:border-brand_accent_hover hover:bg-brand_accent_hover`;
const BUTTON_GHOST_DARK = `${BUTTON_BASE} border border-white/50 text-white hover:bg-white/[0.12]`;

function SectionHeader({
  eyebrow,
  title,
  titleId,
  dark = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  titleId: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-[768px]">
      <span className={`${EYEBROW} mb-2.5 ${dark ? 'text-brand_accent' : 'text-brand_gray_medium'}`}>
        {eyebrow}
      </span>
      <h2 id={titleId} className={`${SECTION_TITLE} ${dark ? 'text-white' : 'text-brand_primary'}`}>
        {title}
      </h2>
      <span aria-hidden="true" className={GOLD_RULE} />
    </div>
  );
}

/**
 * A full-bleed photographic break — the design's mechanism for interrupting the
 * white sections, since photography is the one place the brand permits abundant
 * colour.
 *
 * When the slot has no photograph yet it renders **nothing**. The alternative —
 * a fixed-height black band — reads as a broken image rather than as a page
 * designed with fewer photographs, which is the opposite of degrading honestly.
 */
function PhotoBreak({ src, id }: { src: string | null; id: string }) {
  if (!src) return null;
  return (
    <div id={id} className="h-[clamp(240px,40vw,460px)] w-full bg-brand_primary">
      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
    </div>
  );
}

/**
 * The levels a school teaches and the owner-approved *aspectos destacados* — the
 * part of a school card that answers "why do I care about this one". Both come
 * from `cohort-public.ts`, where the type makes them mandatory, so a school
 * cannot reach this component without them.
 *
 * The two tiers get different treatments, as delivered: the immersion cards are
 * black with an arrow list, the visit cards are white with the highlights run
 * together on one line.
 */
function SchoolDetail({ school }: { school: CohortSchool }) {
  const dark = school.tier === 'inmersion';

  return (
    <>
      <p
        className={`text-[13px] font-medium uppercase tracking-[.08em] ${
          dark ? 'text-brand_accent' : 'text-brand_gray_medium'
        }`}
        data-testid="pasantias-school-levels"
      >
        {school.levels}
      </p>
      {dark ? (
        <ul className="mt-2 space-y-2.5" data-testid="pasantias-school-highlights">
          {school.highlights.map((highlight) => (
            <li key={highlight} className="flex gap-2.5 text-[15px] leading-[1.5] text-white/[0.85]">
              <span aria-hidden="true" className="text-brand_accent">
                →
              </span>
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="mt-1.5 text-[14px] leading-[1.55] text-brand_gray_dark"
          data-testid="pasantias-school-highlights"
        >
          {school.highlights.join(' · ')}
        </p>
      )}
    </>
  );
}

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

export default function PasantiasPage({
  canonicalUrl,
  ogImageUrl,
  weekRanges,
  freeDayDates,
  photos,
  portraits,
}: PasantiasPageProps) {
  const [immersionWeek, visitWeek] = COHORT_WEEKS;
  const [menuOpen, setMenuOpen] = React.useState(false);

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
      question: '¿Necesito hablar catalán?',
      answer: (
        <>
          No. Las sesiones del programa se desarrollan en español: las presentaciones, las
          entrevistas y los talleres. En las escuelas vas a escuchar una mezcla de catalán y
          español, y el equipo de FNE acompaña las visitas.
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

      {/* ============ Site header ============ */}
      <header
        className="sticky top-0 z-50 border-b border-gray-200 bg-white"
        data-testid="pasantias-header"
      >
        <div className={`${SHELL} flex h-20 items-center gap-6`}>
          <Link href="/" className="flex shrink-0 items-center" data-testid="pasantias-home-link">
            <img src="/Logo BW.png?v=3" alt="Fundación Nueva Educación" className="h-9 w-auto" />
          </Link>

          <nav aria-label="Principal" className="ml-auto hidden items-center gap-5 lg:flex xl:gap-7">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.current ? 'page' : undefined}
                className={`whitespace-nowrap text-[13px] uppercase tracking-[.08em] transition-colors duration-200 ${
                  link.current
                    ? 'border-b-2 border-brand_accent pb-[3px] font-semibold text-brand_primary'
                    : 'font-medium text-gray-700 hover:text-brand_primary'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={HUB_LINK.href}
              className="ml-2 inline-flex h-10 items-center whitespace-nowrap rounded-full border border-brand_primary px-4 text-[11px] font-semibold uppercase tracking-[.08em] text-brand_primary transition-colors duration-200 hover:bg-brand_primary hover:text-white"
            >
              {HUB_LINK.label}
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            className="ml-auto grid h-11 w-11 place-items-center rounded-lg border border-gray-300 lg:hidden"
            data-testid="pasantias-menu-toggle"
          >
            <span
              aria-hidden="true"
              className="block h-[11px] w-[18px] border-y-2 border-brand_primary"
            />
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-gray-200 bg-white lg:hidden" data-testid="pasantias-menu">
            <div className={`${SHELL} flex flex-col gap-1 py-4`}>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={link.current ? 'page' : undefined}
                  className={`py-3 text-[14px] uppercase tracking-[.08em] ${
                    link.current
                      ? 'font-semibold text-brand_primary'
                      : 'font-medium text-gray-700'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href={HUB_LINK.href}
                className="mt-2 inline-flex h-12 items-center justify-center rounded-full border border-brand_primary px-5 text-[12px] font-semibold uppercase tracking-[.08em] text-brand_primary"
              >
                {HUB_LINK.label}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="bg-white text-brand_gray_dark">
        {/* ============ Hero ============ */}
        <section
          id="hero"
          className="relative flex min-h-[clamp(560px,86vh,820px)] items-end bg-brand_primary"
          data-testid="pasantias-hero"
        >
          {photos.hero && (
            <img
              src={photos.hero}
              alt="Barcelona, sede de las Pasantías INSPIRA"
              className="absolute inset-0 h-full w-full object-cover"
              decoding="async"
            />
          )}
          {/* The manual's veil: black rising from the text edge, dissolving before
              the focal point. Without a photograph behind it the section is simply
              the brand black, which is why the hero still reads with no image. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-brand_primary/[0.45] via-brand_primary/[0.55] to-brand_primary/80"
          />
          <div className={`${SHELL} relative py-12 sm:py-16 lg:py-24`}>
            <span className={`${EYEBROW} mb-5 text-brand_accent`}>Pasantías internacionales</span>
            <h1 className="m-0 max-w-[20ch] text-[clamp(34px,7.2vw,84px)] font-black uppercase leading-[1.02] tracking-[-.02em] text-white">
              Vive una escuela por dentro, no la visites
            </h1>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <span
                className="inline-flex h-10 items-center whitespace-nowrap rounded-full bg-brand_accent px-[18px] text-[14px] font-bold text-brand_primary"
                data-testid="pasantias-date-chip"
              >
                {COHORT_HEADLINE}
              </span>
              <span className="text-[15px] font-medium text-white/75" data-testid="pasantias-hero-stats">
                {COHORT_VISIT_DAY_COUNT} días de visitas · {COHORT_SCHOOLS.length} escuelas
              </span>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#programa" className={BUTTON_ACCENT} data-testid="pasantias-cta-programa">
                Solicita el programa completo
              </a>
              <a href={FICHA_HREF} className={BUTTON_GHOST_DARK} data-testid="pasantias-cta-ficha">
                Descarga la ficha
              </a>
            </div>
          </div>
        </section>

        {/* ============ Los números ============ */}
        <section
          className="border-t-4 border-transparent bg-brand_primary [border-image:var(--fne-gold-gradient)_1]"
          aria-label="La red INSPIRA en cifras"
          data-testid="pasantias-claims"
        >
          <div className={`${SHELL} grid grid-cols-2 gap-8 py-10 sm:py-14 lg:grid-cols-4 lg:gap-12`}>
            {COHORT_CLAIMS.map((claim, index) => {
              const { figure, caption } = splitClaim(claim);
              return (
                <div key={claim} data-testid={`pasantias-claim-${index}`}>
                  <p
                    className={`text-[clamp(30px,4vw,44px)] font-black leading-none tracking-[-.02em] ${
                      index === 0 ? 'text-brand_accent' : 'text-white'
                    }`}
                  >
                    {figure}
                  </p>
                  <p className="mt-2 text-[13px] font-medium uppercase tracking-[.08em] text-white/70">
                    {caption}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ============ Por qué Barcelona ============ */}
        <section
          id="barcelona"
          className={`${SHELL} ${SECTION_PAD}`}
          aria-labelledby="barcelona-title"
          data-testid="pasantias-barcelona"
        >
          <SectionHeader
            eyebrow="Por qué Barcelona"
            title="Un ecosistema, no una escuela suelta"
            titleId="barcelona-title"
          />
          <div className="mt-8 grid gap-6 text-[17px] leading-[1.65] text-brand_gray_dark lg:mt-14 lg:grid-cols-2 lg:gap-12">
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
          </div>
        </section>

        {/* ============ Dos semanas, dos modos ============ */}
        <section
          id="dos-semanas"
          className={`${SHELL} pb-16 md:pb-24 lg:pb-[120px]`}
          aria-labelledby="modos-title"
          data-testid="pasantias-modos"
        >
          <SectionHeader
            eyebrow="El programa"
            title="Dos semanas, dos modos"
            titleId="modos-title"
          />
          <p className="mt-6 max-w-[768px] text-[17px] leading-[1.65] text-brand_gray_dark">
            Primero te quedas. Después recorres. Ese orden es deliberado: la semana de inmersión te
            da el tiempo suficiente para entender cómo funciona una escuela por dentro, y la semana
            de visitas te muestra cuántas formas distintas puede tomar la misma convicción.
          </p>

          <div className="mt-8 grid items-stretch gap-5 lg:mt-14 lg:grid-cols-3">
            <article
              className={`${CARD_DARK} flex flex-col gap-3.5`}
              data-testid="pasantias-week-semana-1"
            >
              <span className={`${EYEBROW} text-brand_accent`}>{immersionWeek.label}</span>
              <h3 className="m-0 text-[20px] font-bold leading-[1.25] text-white">
                {weekRanges[0]}
              </h3>
              <p className="text-white/80">{immersionWeek.summary}</p>
              <p className="mt-auto border-t border-white/20 pt-4 text-[13px] font-medium uppercase tracking-[.08em] text-white/70">
                {COHORT_IMMERSION_SCHOOLS.length} escuelas
                {UNIFORM_IMMERSION_DAYS !== null && (
                  <> · {formatDays(UNIFORM_IMMERSION_DAYS)} días cada una</>
                )}
              </p>
            </article>

            {/*
              The free weekend is the one solid-yellow card on the page — the
              manual's 10 % accent, spent on the thing the itinerary is most
              often asked about. It keeps the `pasantias-finde` hook the A6a
              suite navigates by; the standalone section it used to be is now
              this card, in the itinerary where it belongs.
            */}
            <article
              className="flex flex-col gap-3.5 rounded-2xl bg-brand_accent p-6 text-brand_primary sm:p-8"
              data-testid="pasantias-finde"
            >
              <span className={`${EYEBROW} text-brand_primary`}>Fin de semana largo</span>
              <h3 className="m-0 text-[20px] font-bold leading-[1.25] text-brand_primary">
                {freeDayDates[0]} al {freeDayDates[freeDayDates.length - 1]}
              </h3>
              <ul className="space-y-1.5 text-[15px] leading-[1.5] text-brand_primary">
                {COHORT_FREE_DAYS.map((freeDay, index) => (
                  <li key={freeDay.date} data-testid={`pasantias-free-day-${index}`}>
                    {freeDay.label}
                  </li>
                ))}
              </ul>
              <p className="mt-auto border-t border-brand_primary/20 pt-4 text-[13px] font-semibold uppercase tracking-[.08em] text-brand_primary">
                {COHORT_FREE_DAYS.length} días para Barcelona o Europa
              </p>
            </article>

            <article
              className={`${CARD_LIGHT} flex flex-col gap-3.5`}
              data-testid="pasantias-week-semana-2"
            >
              <span className={`${EYEBROW} text-brand_accent_text`}>{visitWeek.label}</span>
              <h3 className="m-0 text-[20px] font-bold leading-[1.25] text-brand_primary">
                {weekRanges[1]}
              </h3>
              <p className="text-brand_gray_dark">{visitWeek.summary}</p>
              <p className="mt-auto border-t border-gray-200 pt-4 text-[13px] font-medium uppercase tracking-[.08em] text-brand_gray_medium">
                {COHORT_VISIT_SCHOOLS.length} escuelas de visita
              </p>
            </article>
          </div>
        </section>

        <PhotoBreak id="escuela-interior" src={photos.escuelaInterior} />

        {/* ============ Cómo es un día ============ */}
        <section
          id="un-dia"
          className={`${SHELL} ${SECTION_PAD}`}
          aria-labelledby="dia-title"
          data-testid="pasantias-dia-tipo"
        >
          <SectionHeader
            eyebrow="Dentro de la escuela"
            title="Cómo es un día"
            titleId="dia-title"
          />
          <ol className="mt-8 grid gap-6 lg:mt-14 lg:grid-cols-3 lg:gap-10">
            {COHORT_DAY_STRUCTURE.map((block, index) => (
              <li
                key={block.label}
                className="flex flex-col gap-3 border-t border-gray-200 pt-5"
                data-testid={`pasantias-day-block-${index}`}
              >
                <h3 className={`${EYEBROW} m-0 text-brand_accent_text`}>{block.label}</h3>
                <p className="text-[17px] font-medium leading-[1.5] text-brand_primary">
                  {block.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <PhotoBreak id="barcelona-calle" src={photos.barcelonaCalle} />

        {/* ============ Las escuelas ============ */}
        <section
          id="escuelas"
          className={`${SHELL} ${SECTION_PAD}`}
          aria-labelledby="escuelas-title"
          data-testid="pasantias-escuelas"
        >
          <SectionHeader
            eyebrow={`${COHORT_LODGING_AREA} · ${COHORT_LABEL}`}
            title={`Las ${COHORT_SCHOOLS.length} escuelas`}
            titleId="escuelas-title"
          />

          <h3 className="mb-5 mt-9 text-[13px] font-semibold uppercase tracking-[.15em] text-brand_primary lg:mt-14">
            Escuelas de inmersión{' '}
            {UNIFORM_IMMERSION_DAYS !== null && (
              <span className="font-medium text-brand_gray_medium">
                ({formatDays(UNIFORM_IMMERSION_DAYS)} días cada una)
              </span>
            )}
          </h3>
          <ul className="grid gap-5 lg:grid-cols-2">
            {COHORT_IMMERSION_SCHOOLS.map((school, index) => (
              <li
                key={school.name}
                className={`${CARD_DARK} flex flex-col gap-3`}
                data-testid={`pasantias-school-inmersion-${index}`}
              >
                <h4 className="m-0 text-[clamp(22px,2.6vw,28px)] font-extrabold tracking-[-.01em] text-white">
                  {school.name}
                </h4>
                <SchoolDetail school={school} />
              </li>
            ))}
          </ul>

          <h3 className="mb-5 mt-9 text-[13px] font-semibold uppercase tracking-[.15em] text-brand_primary lg:mt-14">
            Escuelas de visita
          </h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COHORT_VISIT_SCHOOLS.map((school, index) => (
              <li
                key={school.name}
                className="flex flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-6"
                data-testid={`pasantias-school-visita-${index}`}
              >
                <h4 className="m-0 text-[18px] font-bold text-brand_primary">{school.name}</h4>
                {/*
                  Only what Appendix A-5 states. The retired string here read
                  "media jornada", which the Appendix never says: it gives
                  1–2 escuelas por día and marks the two schools outside the city
                  as full-day *because they are outside it*. Half a day was an
                  inference printed to buyers as programme detail. The
                  replacement carries the same contrast the Appendix draws and
                  claims no duration.
                */}
                <p
                  className={`text-[12px] font-semibold uppercase tracking-[.08em] ${
                    school.fullDay ? 'text-brand_accent_text' : 'text-brand_gray_medium'
                  }`}
                >
                  {school.fullDay ? 'Día completo — fuera de Barcelona' : 'Visita en Barcelona'}
                </p>
                <SchoolDetail school={school} />
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] italic text-brand_gray_medium">
            El orden de las visitas puede variar y está sujeto a la disponibilidad de las escuelas.
          </p>
        </section>

        <PhotoBreak id="equipo-foto" src={photos.equipoConversando} />

        {/* ============ El equipo ============ */}
        <section
          id="equipo"
          className="border-y border-gray-200 bg-gray-50"
          aria-labelledby="equipo-title"
          data-testid="pasantias-equipo"
        >
          <div className={`${SHELL} ${SECTION_PAD}`}>
            <SectionHeader
              eyebrow="Quién te acompaña"
              title="El equipo"
              titleId="equipo-title"
            />
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-8">
              {COHORT_EXPERTS.map((expert, index) => (
                <li
                  key={expert.name}
                  className="flex flex-col gap-3"
                  data-testid={`pasantias-expert-${index}`}
                >
                  {portraits[index] ? (
                    <img
                      src={portraits[index] as string}
                      alt=""
                      className="aspect-[4/5] w-full rounded-xl object-cover grayscale"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    /*
                      No portrait on file. A grey rectangle reads as a failed
                      image; the brand's black surface with the initials set in
                      the accent reads as a card that was designed this way, and
                      it stays legible next to the six that do have photographs.
                    */
                    <span
                      aria-hidden="true"
                      className="grid aspect-[4/5] w-full place-items-center rounded-xl bg-brand_primary text-[32px] font-black tracking-[-.02em] text-brand_accent"
                      data-testid={`pasantias-expert-initials-${index}`}
                    >
                      {expert.name
                        .split(' ')
                        .filter((word) => word[0] === word[0].toUpperCase())
                        .map((word) => word[0])
                        .join('')}
                    </span>
                  )}
                  <h3 className="m-0 text-[17px] font-bold leading-[1.25] text-brand_primary">
                    {expert.name}
                  </h3>
                  <p className="text-[14px] leading-[1.5] text-brand_gray_medium">
                    {expert.role}
                    {expert.school && <>, {expert.school}</>}
                    {expert.note && (
                      <>
                        {' — '}
                        <span className="italic text-brand_accent_text">{expert.note}</span>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ Qué te llevas — los objetivos ============ */}
        <section
          id="objetivos"
          className={`${SHELL} ${SECTION_PAD}`}
          aria-labelledby="objetivos-title"
          data-testid="pasantias-objetivos"
        >
          <SectionHeader
            eyebrow="Qué te llevas"
            title={`Los ${COHORT_OBJECTIVES.length} objetivos`}
            titleId="objetivos-title"
          />
          <ol className="mt-8 grid gap-6 lg:mt-14 lg:grid-cols-2 lg:gap-x-10">
            {COHORT_OBJECTIVES.map((objective, index) => (
              <li
                key={objective}
                className="flex gap-4 border-t border-gray-200 pt-5"
                data-testid={`pasantias-objective-${index}`}
              >
                <span
                  aria-hidden="true"
                  className="min-w-[34px] shrink-0 text-[24px] font-black leading-[1.1] tracking-[-.02em] tabular-nums text-brand_accent_text"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="max-w-[60ch] text-[15px] leading-[1.6] text-brand_gray_dark">
                  {objective}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ============ Incluye / No incluye ============ */}
        <section
          id="incluye"
          className={`${SHELL} pb-16 md:pb-24 lg:pb-[120px]`}
          data-testid="pasantias-incluye"
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div className={CARD_DARK}>
              <h2 className={`${EYEBROW} mb-5 text-brand_accent`}>Incluye</h2>
              <ul className="space-y-3.5">
                {COHORT_INCLUDES.map((item) => (
                  <li key={item} className="flex gap-3 text-white/[0.88]">
                    <span aria-hidden="true" className="text-brand_accent">
                      →
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-8">
              <h2 className={`${EYEBROW} mb-5 text-brand_gray_medium`}>No incluye</h2>
              <ul className="space-y-3.5">
                {COHORT_EXCLUDES.map((item) => (
                  <li key={item} className="flex gap-3 text-brand_gray_dark">
                    <span aria-hidden="true" className="text-brand_gray_medium">
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 border-t border-gray-200 pt-5 text-[14px] italic text-brand_gray_medium">
                Alojamiento en {COHORT_LODGING_AREA}, coordinado con el equipo de FNE.
              </p>
            </div>
          </div>
        </section>

        {/*
          ============ #programa — INTERIM PANEL, REPLACED IN A6b ============
          The delivered design puts a full request form in this column. A6b owns
          the form's behaviour — the lead table, the split consent evidence and
          the API route are all its scope — so this round ports the section's
          treatment and keeps A6a's interim mailto. Shipping inputs that look
          live and submit nowhere would be worse than the panel.
          A6b swaps the right-hand column for `components/pasantias/LeadForm.tsx`
          and keeps the `id="programa"` anchor and the section boundary intact so
          the hero CTA and every other link keep working across that swap.
        */}
        <section
          id="programa"
          className="relative scroll-mt-20 overflow-hidden bg-brand_primary text-white"
          aria-labelledby="programa-title"
          data-testid="pasantias-programa"
        >
          {/*
            `invert` because the lineal symbol ships as black line art on
            transparent, and the manual's watermark treatment puts it on the
            black surface — at 12 % it is otherwise invisible, which is how the
            mockup rendered it. Inverting gives the faint white line the manual
            actually shows.
          */}
          <img
            src="/logos/symbol-lineal.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-16 w-[min(520px,60vw)] invert opacity-[var(--watermark-opacity)]"
          />
          <div className={`${SHELL} ${SECTION_PAD} relative grid gap-10 lg:grid-cols-2 lg:gap-16`}>
            <div>
              <SectionHeader
                eyebrow={COHORT_HEADLINE}
                title="Solicita el programa completo"
                titleId="programa-title"
                dark
              />
              <p className="mt-6 max-w-[44ch] text-white/80">
                Escríbenos y te enviamos el programa detallado de la pasantía, con el itinerario de
                las dos semanas, las escuelas y las condiciones de participación.
              </p>
            </div>

            <div className={`${CARD_DARK} border border-white/20 lg:self-start`}>
              <p className="text-[15px] leading-[1.6] text-white/80">
                Mientras habilitamos el formulario, la vía directa es el correo del equipo. Cuéntanos
                quién eres, tu colegio y cuántas personas viajarían.
              </p>
              <div className="mt-7 flex flex-col gap-3">
                <a href={PROGRAMA_MAILTO} className={BUTTON_ACCENT} data-testid="pasantias-cta-mailto">
                  Escríbenos a {CONTACT_EMAIL}
                </a>
                <a href={FICHA_HREF} className={BUTTON_GHOST_DARK} data-testid="pasantias-cta-ficha-programa">
                  Descarga la ficha (PDF)
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section
          id="faq"
          className={`${SHELL} ${SECTION_PAD}`}
          aria-labelledby="faq-title"
          data-testid="pasantias-faq"
        >
          <SectionHeader
            eyebrow="Antes de decidir"
            title="Preguntas frecuentes"
            titleId="faq-title"
          />
          <div className="mt-8 max-w-[860px] lg:mt-12">
            {faqs.map((faq, index) => (
              <details
                key={faq.question}
                open={index === 0}
                className="group border-t border-gray-200 last:border-b"
                data-testid={`pasantias-faq-${index}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-[22px] text-[17px] font-bold text-brand_primary [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[20px] leading-none text-brand_accent_text transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="max-w-[70ch] pb-6 text-[15px] leading-[1.65] text-brand_gray_dark">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ============ Cierre ============ */}
        <section
          id="cierre"
          className="relative bg-brand_primary"
          aria-labelledby="cierre-title"
          data-testid="pasantias-cierre"
        >
          {photos.barcelonaTarde && (
            <img
              src={photos.barcelonaTarde}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )}
          <div aria-hidden="true" className="absolute inset-0 bg-brand_primary/70" />
          <div className={`${SHELL} ${SECTION_PAD} relative flex flex-col items-start gap-6`}>
            <img src="/logos/symbol-gold.png" alt="" aria-hidden="true" className="h-auto w-14" />
            <h2
              id="cierre-title"
              className="m-0 max-w-[22ch] text-[clamp(26px,4vw,40px)] font-black uppercase leading-[1.08] tracking-[-.02em] text-white"
            >
              Conversemos antes de que se cierre la cohorte
            </h2>
            <p className="max-w-[52ch] text-white/80">
              Escríbenos por WhatsApp y te contamos cómo se prepara el viaje con tu equipo.
            </p>
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className={BUTTON_ACCENT}
              data-testid="pasantias-cta-whatsapp"
            >
              WhatsApp {WHATSAPP_DISPLAY}
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
