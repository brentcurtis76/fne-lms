/**
 * `/pasantias` — the public landing page for Pasantías INSPIRA Barcelona.
 *
 * A6r ported the externally-authored redesign delivered under
 * `docs/plan/design/a6r-handoff/`; PASANT-B003 moved its content to the ratified
 * January 2027 cohort and its two programs, keeping the same design system,
 * sections and components. **No cohort fact is written in this file.** Dates,
 * programs, audiences, schools, the calendar, the day structure, the claims and
 * the inclusion lists all come from `lib/pasantias/cohort-public.ts`, which
 * transcribes `docs/plan/pasantias-january-contract.md`, and
 * `__tests__/pages/pasantias-hardcoded-cohort.test.ts` fails on any of those
 * strings appearing as a literal here — or on a fact the module holds that this
 * page stops printing.
 *
 * Every module value is printed directly — no value is read only as a flag, an
 * agreement or a length — so the guard can prove each one is on the page.
 *
 * D-01/D-02: `cohort-commercial.ts` is server-only and must never be imported
 * here — `scripts/check-price-leak.mjs` fails the build if it ever is. There are
 * no prices on this page at all; the ficha it links to carries none either. The
 * brochure (which does) is only ever linked.
 *
 * The two program CTAs preselect that program in the request form
 * (`components/pasantias/LeadForm.tsx`), where the visitor can still change it.
 */
import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Footer from '../components/Footer';
import LeadForm, { type ProgramRequest } from '../components/pasantias/LeadForm';
import { getAppBaseUrl } from '../lib/utils/app-url';
import { PASANTIAS_IMAGE_PATHS } from '../lib/pasantias/image-manifest';
import type { CohortProgram, ProgramId } from '../lib/pasantias/cohort-public';
import {
  COHORT_ACCREDITATION,
  COHORT_CITY,
  COHORT_CLAIMS,
  COHORT_CONTACT,
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
  COHORT_SPAN,
  COHORT_TOGETHER,
} from '../lib/pasantias/cohort-public';

/**
 * es-CL writes the decimal separator as a comma. Done by hand rather than with
 * `toLocaleString` because this runs on both sides of hydration and a browser
 * without es-CL locale data would render `2.5` where the server rendered `2,5`.
 */
function formatNumber(value: number): string {
  return String(value).replace('.', ',');
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

/** `a, b y c` — the es-CL way to close an enumeration. */
function joinEs(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * How many school weeks each program's calendar is designed around. Exported so
 * `__tests__/pages/pasantias-hardcoded-cohort.test.ts` can pin the module to it;
 * the calendar itself maps every week the module has, so a third week renders a
 * third card rather than disappearing.
 */
export const DESIGNED_WEEK_COUNT = 2;

/** `wa.me` wants the number with no punctuation; derived from the module's display form. */
function whatsappHref(): string {
  const message = `Hola, quiero información sobre las Pasantías INSPIRA Barcelona (${COHORT_LABEL}).`;
  return `https://wa.me/${COHORT_CONTACT.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

const FICHA_HREF = '/api/pasantias/ficha';

const PAGE_PATH = '/pasantias';
const PAGE_TITLE = `Pasantías INSPIRA Barcelona · ${COHORT_HEADLINE} | Fundación Nueva Educación`;

/**
 * The `<meta description>` and both social descriptions. A function read at
 * render time, and exported: `next/head` contributes nothing to a static render,
 * so the guard reads this sentence from here instead of from the markup.
 */
export function buildMetaDescription(): string {
  const [inspira, mirada] = COHORT_PROGRAMS;
  return `${COHORT_HEADLINE}. ${inspira.name}: ${inspira.audience}, ${formatNumber(
    inspira.schoolDays
  )} días en escuelas. ${mirada.name}: ${mirada.audience}, ${formatNumber(
    mirada.schoolDays
  )} días en escuelas. ${COHORT_TOGETHER}.`;
}

/**
 * The site header, replicated so `/pasantias` reads as part of
 * nuevaeducacion.org rather than as a stray landing page. Destinations are the
 * routes this repository actually serves.
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
 * fill it, best first. A slot that resolves to nothing is not rendered at all —
 * see {@link PhotoBreak}. Dropping `hero-barcelona.jpg` into
 * `public/images/pasantias/` is therefore the whole of "add the real photo".
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
  /**
   * Absolute URL of the share image, or `null` when no share image is
   * guaranteed to exist — see {@link OG_IMAGE_PATH}.
   */
  ogImageUrl: string | null;
  /** es-CL range of the shared cohort span. */
  spanRange: string;
  /** es-CL date range per program of {@link COHORT_PROGRAMS}, same order. */
  programRanges: string[];
  /** es-CL date range per week, per program, same order. */
  weekRanges: string[][];
  /** es-CL dates of the common free weekend, first and last. */
  freeWeekendDates: [string, string];
  /** es-CL date of the second program's closing presentation. */
  closingDate: string;
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
 * Two dates as one range, each written in full — `18 de enero al 28 de enero` —
 * so every date the page prints is a whole "día de mes" a reader (and the guard)
 * can find on its own. Both ends stay derived: this reformats the module's
 * dates, it does not choose them.
 */
function formatRange(startIsoDate: string, endIsoDate: string): string {
  return `${formatDayMonth(startIsoDate)} al ${formatDayMonth(endIsoDate)}`;
}

/**
 * Portrait filenames are derived from the host's name in the module, never
 * listed here: a lookup table keyed by name would put cohort strings back into
 * this file, which is the thing [A1] forbids.
 */
function portraitSlug(name: string): string {
  return name
    .normalize('NFD')
    // Every combining mark NFD split off (the accents), as a property escape.
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

/**
 * Which photographs ship, decided at build time: `lib/pasantias/image-manifest.ts`
 * is generated from the directory by `npm run images:manifest` and committed, so
 * resolution is a `Set` lookup that cannot depend on the runtime's filesystem
 * (a Vercel function's file trace does not include `public/`).
 */
const AVAILABLE_IMAGES = new Set(PASANTIAS_IMAGE_PATHS);

/** First candidate that actually ships, or `null` when the slot is still empty. */
function resolveImage(directory: string, basenames: readonly string[]): string | null {
  for (const basename of basenames) {
    for (const extension of IMAGE_EXTENSIONS) {
      const path = `/${directory}/${basename}${extension}`;
      if (AVAILABLE_IMAGES.has(path)) return path;
    }
  }
  return null;
}

/** Resolved `/images/...` URL per slot, or `null` when nothing fills it yet. */
const PHOTOS = Object.fromEntries(
  (Object.keys(PHOTO_SLOTS) as PhotoSlot[]).map((slot) => [
    slot,
    resolveImage('images/pasantias', PHOTO_SLOTS[slot]),
  ])
) as Record<PhotoSlot, string | null>;

/**
 * The share image, or `null` when none is guaranteed. It is the hero, so the
 * unfurl and the page can never disagree; when nothing ships the `og:image` /
 * `twitter:image` tags are omitted rather than guessed.
 */
const OG_IMAGE_PATH: string | null =
  PHOTOS.hero ?? resolveImage('images/pasantias', ['bcn-skyline']);

/**
 * `getAppBaseUrl` is called directly and is allowed to throw: the canonical and
 * OG URLs are scraped and cached by third parties, so a Host-derived origin
 * would outlive the request (see `lib/utils/app-url.ts`). CI configures the
 * origin in the `.env.local` it generates for the e2e stack.
 */
export const getServerSideProps: GetServerSideProps<PasantiasPageProps> = async (context) => {
  const origin = getAppBaseUrl(context.req);
  const [, mirada] = COHORT_PROGRAMS;

  return {
    props: {
      canonicalUrl: `${origin}${PAGE_PATH}`,
      ogImageUrl: OG_IMAGE_PATH ? `${origin}${OG_IMAGE_PATH}` : null,
      spanRange: formatRange(COHORT_SPAN.startDate, COHORT_SPAN.endDate),
      programRanges: COHORT_PROGRAMS.map((program) =>
        formatRange(program.startDate, program.endDate)
      ),
      weekRanges: COHORT_PROGRAMS.map((program) =>
        program.weeks.map((week) => formatRange(week.startDate, week.endDate))
      ),
      freeWeekendDates: [
        formatDayMonth(COHORT_FREE_WEEKEND.startDate),
        formatDayMonth(COHORT_FREE_WEEKEND.endDate),
      ],
      closingDate: formatDayMonth(mirada.closing.date),
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
 * A full-bleed photographic break. When the slot has no photograph yet it
 * renders **nothing**: a fixed-height black band reads as a broken image rather
 * than as a page designed with fewer photographs.
 */
function PhotoBreak({ src, id }: { src: string | null; id: string }) {
  if (!src) return null;
  return (
    <div id={id} className="h-[clamp(240px,40vw,460px)] w-full bg-brand_primary">
      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
    </div>
  );
}

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

/** One program's calendar column: its weeks, each as a card. */
function ProgramCalendar({
  program,
  ranges,
}: {
  program: CohortProgram;
  ranges: string[];
}) {
  return (
    <div className="flex flex-col gap-4" data-testid={`pasantias-calendar-${program.id}`}>
      <h3 className="m-0 text-[20px] font-bold leading-[1.25] text-brand_primary">{program.name}</h3>
      {program.weeks.map((week, index) => (
        <article
          key={week.id}
          className={`${index === 0 ? CARD_DARK : CARD_LIGHT} flex flex-col gap-2.5`}
          data-testid={`pasantias-week-${program.id}-${week.id}`}
        >
          <span className={`${EYEBROW} ${index === 0 ? 'text-brand_accent' : 'text-brand_accent_text'}`}>
            {week.label}
          </span>
          <p
            className={`m-0 text-[18px] font-bold leading-[1.3] ${
              index === 0 ? 'text-white' : 'text-brand_primary'
            }`}
          >
            {ranges[index]}
          </p>
          <p className={index === 0 ? 'text-white/80' : 'text-brand_gray_dark'}>{week.summary}</p>
        </article>
      ))}
    </div>
  );
}

export default function PasantiasPage({
  canonicalUrl,
  ogImageUrl,
  spanRange,
  programRanges,
  weekRanges,
  freeWeekendDates,
  closingDate,
}: PasantiasPageProps) {
  const photos = PHOTOS;
  const [inspira, mirada] = COHORT_PROGRAMS;
  const metaDescription = buildMetaDescription();
  const portraits = COHORT_HOSTS.map((host) =>
    resolveImage('images/pasantias/equipo', [portraitSlug(host.name)])
  );
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [programRequest, setProgramRequest] = React.useState<ProgramRequest | null>(null);

  /** A program CTA: preselect it in the form. The anchor's own jump does the scrolling. */
  const requestProgram = (program: ProgramId) =>
    setProgramRequest((current) => ({ program, nonce: (current?.nonce ?? 0) + 1 }));

  const routingSentence = COHORT_ROUTING.map((route) => `${route.question} ${route.program}.`).join(
    ' '
  );

  const faqs: FaqItem[] = [
    {
      question: '¿Qué programa me corresponde?',
      answer: (
        <>
          {`${COHORT_ROUTING[0].question} ${COHORT_ROUTING[0].program}: ${inspira.audience}. ${COHORT_ROUTING[1].question} ${COHORT_ROUTING[1].program}: ${mirada.audience}.`}
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
      question: '¿Viajan juntos los programas?',
      answer: (
        <>{`Sí. ${COHORT_TOGETHER}. Los programas comparten el fin de semana libre: ${COHORT_FREE_WEEKEND.label}.`}</>
      ),
    },
    {
      question: '¿Cómo reservo mi cupo?',
      answer: (
        <>
          {`${COHORT_PLACES} Registra tu interés más abajo y descarga la ficha y el programa completo con los valores.`}
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
          <a className="underline hover:no-underline" href={`mailto:${COHORT_CONTACT.email}`}>
            {COHORT_CONTACT.email}
          </a>{' '}
          y coordinamos una propuesta para tu equipo.
        </>
      ),
    },
  ];

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={metaDescription} />
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Fundación Nueva Educación" />
        <meta property="og:locale" content="es_CL" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        {/* Omitted rather than guessed when no share image is guaranteed to
            ship — an unfurl pointing at a 404 is worse than no image at all. */}
        {ogImageUrl && (
          <>
            <meta property="og:image" content={ogImageUrl} />
            <meta property="og:image:alt" content="Barcelona, sede de las Pasantías INSPIRA" />
          </>
        )}

        <meta name="twitter:card" content={ogImageUrl ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={metaDescription} />
        {ogImageUrl && <meta name="twitter:image" content={ogImageUrl} />}
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
          {/*
            The manual's veil: black rising from the text edge, dissolving before
            the focal point, anchored from the bottom in pixels so the eyebrow
            clears 4.5:1 at every window height (`tests/e2e/pasantias-page.spec.ts`
            samples the composited pixels behind the glyphs).
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-brand_primary/[0.92] via-brand_primary/[0.85] via-[480px] to-brand_primary/15"
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
                {COHORT_TOGETHER}
              </span>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#programa" className={BUTTON_ACCENT} data-testid="pasantias-cta-programa">
                Registra tu interés
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
          <div className={`${SHELL} py-10 sm:py-14`}>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 lg:gap-12">
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
            <p
              className="mt-8 border-t border-white/20 pt-5 text-[14px] text-white/75"
              data-testid="pasantias-accreditation"
            >
              {COHORT_ACCREDITATION}
            </p>
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
            eyebrow={`Por qué ${COHORT_CITY}`}
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

        {/* ============ Los programas ============ */}
        <section
          id="programas"
          className={`${SHELL} pb-16 md:pb-24 lg:pb-[120px]`}
          aria-labelledby="programas-title"
          data-testid="pasantias-programas"
        >
          <SectionHeader eyebrow="Elige tu programa" title={routingSentence} titleId="programas-title" />

          <div className="mt-8 grid items-stretch gap-5 lg:mt-14 lg:grid-cols-2">
            {[inspira, mirada].map((program, index) => (
              <article
                key={program.id}
                className={`${index === 0 ? CARD_DARK : CARD_LIGHT} flex flex-col gap-3.5`}
                data-testid={`pasantias-program-${program.id}`}
              >
                <h3
                  className={`m-0 text-[clamp(22px,2.6vw,28px)] font-extrabold tracking-[-.01em] ${
                    index === 0 ? 'text-white' : 'text-brand_primary'
                  }`}
                >
                  {program.name}
                </h3>
                <p
                  className={`text-[13px] font-semibold uppercase tracking-[.08em] ${
                    index === 0 ? 'text-brand_accent' : 'text-brand_accent_text'
                  }`}
                >
                  {program.audience}
                </p>
                <p className={`text-[17px] font-bold ${index === 0 ? 'text-white' : 'text-brand_primary'}`}>
                  {programRanges[index]}
                </p>
                <p className={index === 0 ? 'text-white/80' : 'text-brand_gray_dark'}>
                  {`${formatNumber(program.schoolDays)} días en escuelas · ${formatNumber(
                    program.schoolCount
                  )} escuelas`}
                </p>
                <p className={index === 0 ? 'text-white/80' : 'text-brand_gray_dark'}>
                  {program.overview}
                </p>
                <p
                  className={`mt-auto border-t pt-4 text-[15px] italic ${
                    index === 0 ? 'border-white/20 text-white/85' : 'border-gray-200 text-brand_gray_dark'
                  }`}
                >
                  {program.takeaway}
                </p>
                <a
                  href="#programa"
                  onClick={() => requestProgram(program.id)}
                  className={index === 0 ? BUTTON_ACCENT : `${BUTTON_BASE} border border-brand_primary text-brand_primary hover:bg-brand_primary hover:text-white`}
                  data-testid={`pasantias-cta-program-${program.id}`}
                >
                  {`Registrar interés en ${program.name}`}
                </a>
              </article>
            ))}
          </div>
        </section>

        <PhotoBreak id="escuela-interior" src={photos.escuelaInterior} />

        {/* ============ El calendario ============ */}
        <section
          id="calendario"
          className={`${SHELL} ${SECTION_PAD}`}
          aria-labelledby="calendario-title"
          data-testid="pasantias-calendario"
        >
          <SectionHeader eyebrow={COHORT_LABEL} title="El calendario" titleId="calendario-title" />
          <p className="mt-6 max-w-[768px] text-[17px] leading-[1.65] text-brand_gray_dark">
            {`${spanRange} · ${COHORT_TOGETHER}.`}
          </p>

          <div className="mt-8 grid items-start gap-5 lg:mt-14 lg:grid-cols-3">
            <ProgramCalendar program={inspira} ranges={weekRanges[0]} />

            {/*
              The free weekend is the one solid-yellow card on the page — the
              manual's 10 % accent, spent on the thing the itinerary is most
              often asked about. Common to both programs, so it sits between
              their calendars and keeps the `pasantias-finde` hook.
            */}
            <article
              className="flex flex-col gap-3.5 rounded-2xl bg-brand_accent p-6 text-brand_primary sm:p-8 lg:self-center"
              data-testid="pasantias-finde"
            >
              <span className={`${EYEBROW} text-brand_primary`}>Fin de semana libre</span>
              <p className="m-0 text-[20px] font-bold leading-[1.25] text-brand_primary">
                {COHORT_FREE_WEEKEND.label}
              </p>
              <p className="text-[14px] text-brand_primary" data-testid="pasantias-free-weekend-dates">
                {freeWeekendDates[0]}
              </p>
              <p className="text-[14px] text-brand_primary">{freeWeekendDates[1]}</p>
            </article>

            <ProgramCalendar program={mirada} ranges={weekRanges[1]} />
          </div>
        </section>

        {/* ============ Cómo es un día ============ */}
        <section
          id="un-dia"
          className={`${SHELL} pb-16 md:pb-24 lg:pb-[120px]`}
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
                key={block}
                className="flex flex-col gap-3 border-t border-gray-200 pt-5"
                data-testid={`pasantias-day-block-${index}`}
              >
                <p className="text-[17px] font-medium leading-[1.5] text-brand_primary">{block}</p>
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
            eyebrow={`${COHORT_CITY} · ${COHORT_LABEL}`}
            title="Las escuelas"
            titleId="escuelas-title"
          />

          <div data-testid={`pasantias-escuelas-${inspira.id}`}>
            <h3 className="mb-5 mt-9 text-[13px] font-semibold uppercase tracking-[.15em] text-brand_primary lg:mt-14">
              {inspira.name}
            </h3>
            <ul className="grid gap-5 lg:grid-cols-2">
              {inspira.immersionSchools.map((school, index) => (
                <li
                  key={school.name}
                  className={`${CARD_DARK} flex flex-col gap-3`}
                  data-testid={`pasantias-school-inmersion-${index}`}
                >
                  <h4 className="m-0 text-[clamp(22px,2.6vw,28px)] font-extrabold tracking-[-.01em] text-white">
                    {school.name}
                  </h4>
                  <p className="text-[13px] font-medium uppercase tracking-[.08em] text-brand_accent">
                    {`${formatNumber(school.days)} días por pasante`}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-[17px] font-semibold text-brand_primary" data-testid="pasantias-visit-count">
              {`Cada cohorte visita ${formatNumber(inspira.visits.count)} de estas ${
                inspira.visits.candidates.length
              } escuelas.`}
            </p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {inspira.visits.candidates.map((name, index) => (
                <li
                  key={name}
                  className="flex flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-6"
                  data-testid={`pasantias-school-visita-${index}`}
                >
                  <h4 className="m-0 text-[18px] font-bold text-brand_primary">{name}</h4>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[15px] text-brand_gray_dark">{inspira.visits.selection}</p>
            <p className="mt-2 text-[15px] text-brand_gray_dark" data-testid="pasantias-full-day">
              {`${joinEs(inspira.visits.fullDayOutside)} están fuera de ${COHORT_CITY} y toman el día completo.`}
            </p>
          </div>

          <div data-testid={`pasantias-escuelas-${mirada.id}`}>
            <h3 className="mb-5 mt-12 text-[13px] font-semibold uppercase tracking-[.15em] text-brand_primary lg:mt-16">
              {mirada.name}
            </h3>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mirada.schools.map((name, index) => (
                <li
                  key={name}
                  className="flex flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-6"
                  data-testid={`pasantias-school-mirada-${index}`}
                >
                  <h4 className="m-0 text-[18px] font-bold text-brand_primary">{name}</h4>
                  <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-brand_accent_text">
                    {`${formatNumber(mirada.daysPerSchool)} días completos`}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[15px] text-brand_gray_dark">{mirada.orderCaveat}</p>
          </div>
        </section>

        {/* ============ The second program: antes, durante y después ============ */}
        <section
          id="antes-durante-despues"
          className="border-y border-gray-200 bg-gray-50"
          aria-labelledby="mirada-title"
          data-testid="pasantias-mirada-extra"
        >
          <div className={`${SHELL} ${SECTION_PAD}`}>
            <SectionHeader
              eyebrow={mirada.audience}
              title={`${mirada.name}: antes, durante y después`}
              titleId="mirada-title"
            />
            <ol className="mt-8 grid gap-6 lg:mt-14 lg:grid-cols-3 lg:gap-10">
              <li className="flex flex-col gap-3 border-t border-gray-300 pt-5">
                <h3 className={`${EYEBROW} m-0 text-brand_accent_text`}>Antes del viaje</h3>
                <p className="text-[17px] font-medium leading-[1.5] text-brand_primary">
                  {mirada.preparation}
                </p>
              </li>
              <li className="flex flex-col gap-3 border-t border-gray-300 pt-5">
                <h3 className={`${EYEBROW} m-0 text-brand_accent_text`}>{`Cierre · ${closingDate}`}</h3>
                <p className="text-[17px] font-medium leading-[1.5] text-brand_primary">
                  {mirada.closing.text}
                </p>
              </li>
              <li className="flex flex-col gap-3 border-t border-gray-300 pt-5">
                <h3 className={`${EYEBROW} m-0 text-brand_accent_text`}>Seguimiento</h3>
                <p className="text-[17px] font-medium leading-[1.5] text-brand_primary">
                  {mirada.followUp}
                </p>
              </li>
            </ol>
          </div>
        </section>

        <PhotoBreak id="equipo-foto" src={photos.equipoConversando} />

        {/* ============ Quién te recibe ============ */}
        <section
          id="equipo"
          className={`${SHELL} ${SECTION_PAD}`}
          aria-labelledby="equipo-title"
          data-testid="pasantias-equipo"
        >
          <SectionHeader eyebrow="En las escuelas" title="Quién te recibe" titleId="equipo-title" />
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-8">
            {COHORT_HOSTS.map((host, index) => (
              <li key={host.name} className="flex flex-col gap-3" data-testid={`pasantias-host-${index}`}>
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
                    No portrait on file: the brand's black surface with the
                    initials set in the accent reads as a card designed this way.
                  */
                  <span
                    aria-hidden="true"
                    className="grid aspect-[4/5] w-full place-items-center rounded-xl bg-brand_primary text-[32px] font-black tracking-[-.02em] text-brand_accent"
                    data-testid={`pasantias-host-initials-${index}`}
                  >
                    {host.name
                      .split(' ')
                      .filter((word) => word[0] === word[0].toUpperCase())
                      .map((word) => word[0])
                      .join('')}
                  </span>
                )}
                <h3 className="m-0 text-[17px] font-bold leading-[1.25] text-brand_primary">
                  {host.name}
                </h3>
                <p className="text-[14px] leading-[1.5] text-brand_gray_medium">
                  {`${host.role}, ${host.school} — `}
                  <span className="italic text-brand_accent_text">{host.note}</span>
                </p>
              </li>
            ))}
          </ul>
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
                {[inspira.lunches, mirada.lunches].map((item, index) => (
                  <li
                    key={item}
                    className="flex gap-3 text-white/[0.88]"
                    data-testid={`pasantias-lunches-${index}`}
                  >
                    <span aria-hidden="true" className="text-brand_accent">
                      →
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
                {mirada.extraIncludes.map((item) => (
                  <li key={item} className="flex gap-3 text-white/[0.88]">
                    <span aria-hidden="true" className="text-brand_accent">
                      →
                    </span>
                    <span>{`${mirada.name}: ${item}`}</span>
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
            </div>
          </div>
        </section>

        {/*
          ============ #programa ============
          `components/pasantias/LeadForm.tsx` owns everything about the
          submission; this section owns only where it sits. The `id="programa"`
          anchor, the section boundary and the ficha CTA are kept, so the ficha
          stays reachable while the right column shows the confirmation.
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
            black surface.
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
                title="Registra tu interés"
                titleId="programa-title"
                dark
              />
              <p className="mt-6 max-w-[44ch] text-white/80">
                Elige el programa que te corresponde. Si te interesa más de uno, registra una
                solicitud por cada programa con el mismo correo.
              </p>
              <p className="mt-4 max-w-[44ch] text-white/80" data-testid="pasantias-places">
                {COHORT_PLACES}
              </p>
              <div className="mt-7">
                <a href={FICHA_HREF} className={BUTTON_GHOST_DARK} data-testid="pasantias-cta-ficha-programa">
                  Descarga la ficha (PDF)
                </a>
              </div>
            </div>

            <LeadForm requestedProgram={programRequest} />
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
              href={whatsappHref()}
              target="_blank"
              rel="noopener noreferrer"
              className={BUTTON_ACCENT}
              data-testid="pasantias-cta-whatsapp"
            >
              {`WhatsApp ${COHORT_CONTACT.whatsapp}`}
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
