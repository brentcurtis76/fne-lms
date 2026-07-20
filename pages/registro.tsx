import React, { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import { ArrowRight, Check, Loader2, ShieldCheck } from 'lucide-react';
import { createServiceRoleClient } from '../lib/api-auth';
import {
  GenerationOption,
  SchoolOption,
  TRACTOR_ROLE_LABELS,
  TractorSignupRole,
  getAllGenerations,
  getAllSchools,
  isValidBirthDate,
  isValidEmail,
  normalizeEmail,
  normalizeText,
} from '../lib/signups';

interface RegistroProps {
  schools: SchoolOption[];
  generations: GenerationOption[];
  schoolLoadError: boolean;
}

interface FormState {
  firstName: string;
  lastName: string;
  schoolId: string;
  generationId: string;
  email: string;
  birthDate: string;
  profession: string;
  role: TractorSignupRole | '';
  consentAccepted: boolean;
  website: string;
}

type FieldError =
  | 'firstName'
  | 'lastName'
  | 'schoolId'
  | 'email'
  | 'birthDate'
  | 'profession'
  | 'role'
  | 'consent';

const initialForm: FormState = {
  firstName: '',
  lastName: '',
  schoolId: '',
  generationId: '',
  email: '',
  birthDate: '',
  profession: '',
  role: '',
  consentAccepted: false,
  website: '',
};

const ERROR_MESSAGES: Record<Exclude<FieldError, 'consent'>, string> = {
  firstName: 'Ingresa tu nombre.',
  lastName: 'Ingresa tu apellido.',
  schoolId: 'Selecciona tu colegio.',
  email: 'Ingresa un correo válido.',
  birthDate: 'Ingresa tu fecha de nacimiento.',
  profession: 'Ingresa tu profesión.',
  role: 'Selecciona tu rol.',
};

// Focus order for the first invalid control on a failed submit.
const FOCUS_ORDER: Exclude<FieldError, 'consent'>[] = [
  'firstName',
  'lastName',
  'schoolId',
  'email',
  'birthDate',
  'profession',
  'role',
];

export const getServerSideProps: GetServerSideProps<RegistroProps> = async (context) => {
  const supabase = createServiceRoleClient();

  // Schools are required: without them the form is disabled. Generations are
  // optional metadata, so a failure there only hides the selector. The two
  // queries are independent — run them concurrently; the generations result
  // is discarded when schools fail.
  const schoolsPromise = getAllSchools(supabase);
  const generationsPromise = getAllGenerations(supabase).catch((error) => {
    console.error('[registro] Failed to load generations (selector hidden):', error);
    return [] as GenerationOption[];
  });

  let schools: SchoolOption[] = [];
  let schoolLoadError = false;
  try {
    schools = await schoolsPromise;
  } catch (error) {
    console.error('[registro] Failed to load schools:', error);
    schoolLoadError = true;
  }

  const generations = schoolLoadError ? [] : await generationsPromise;

  if (!schoolLoadError) {
    // Public, rarely-changing data: let the CDN absorb repeat views. Errors
    // are not cached so a transient failure doesn't stick for 5 minutes.
    context.res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  }

  return { props: { schools, generations, schoolLoadError } };
};

// Shared control styling. Genera tokens: focus ring is always yellow (never blue);
// invalid turns the border + ring red. Tailwind's default gray scale matches the
// Genera grays exactly (gray-300 #d1d5db, gray-400 #9ca3af, …).
const CONTROL_BASE =
  'w-full rounded-lg border bg-white px-[14px] py-3 text-[15px] font-medium leading-[1.2] transition duration-[180ms] focus:outline-none focus:ring-[3px]';

function borderClasses(invalid: boolean): string {
  return invalid
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/[0.22]'
    : 'border-gray-300 focus:border-brand_accent focus:ring-brand_accent/[0.28]';
}

export default function RegistroPage({ schools, generations, schoolLoadError }: RegistroProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<FieldError, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const schoolsAvailable = schools.length > 0 && !schoolLoadError;

  const generationsBySchool = useMemo(() => {
    const grouped = new Map<number, GenerationOption[]>();
    for (const generation of generations) {
      const existing = grouped.get(generation.school_id) ?? [];
      existing.push(generation);
      grouped.set(generation.school_id, existing);
    }
    return grouped;
  }, [generations]);

  const selectedGenerations = form.schoolId
    ? generationsBySchool.get(Number(form.schoolId)) ?? []
    : [];

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      // A different school means the previous generation no longer applies.
      if (field === 'schoolId' && current.schoolId !== value) {
        next.generationId = '';
      }
      return next;
    });
    // Clear the matching field error as soon as the user corrects it.
    const key: FieldError | null =
      field === 'consentAccepted'
        ? 'consent'
        : field === 'website' || field === 'generationId'
          ? null
          : (field as FieldError);
    if (key) {
      setErrors((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
    }
  };

  const validate = (): Partial<Record<FieldError, boolean>> => {
    const next: Partial<Record<FieldError, boolean>> = {};
    if (!normalizeText(form.firstName)) next.firstName = true;
    if (!normalizeText(form.lastName)) next.lastName = true;
    if (!form.schoolId) next.schoolId = true;
    if (!isValidEmail(normalizeEmail(form.email))) next.email = true;
    if (!isValidBirthDate(form.birthDate)) next.birthDate = true;
    if (!normalizeText(form.profession)) next.profession = true;
    if (!form.role) next.role = true;
    if (!form.consentAccepted) next.consent = true;
    return next;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      const firstInvalid = FOCUS_ORDER.find((id) => nextErrors[id]) ?? (nextErrors.consent ? 'acepto' : null);
      if (firstInvalid) {
        document.getElementById(firstInvalid)?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/registro-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'No pudimos enviar tu registro. Intenta nuevamente.');
      }

      setSubmitted(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No pudimos enviar tu registro. Intenta nuevamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const successName = normalizeText(form.firstName) || 'colega';
  const successEmail = form.email.trim() || 'tu correo';

  return (
    <>
      <Head>
        <title>Registro · Genera</title>
        <meta
          name="description"
          content="Registro para acceder a Genera, la plataforma de la Fundación Nueva Educación."
        />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>

      <main className="grid min-h-screen grid-cols-1 font-mont text-brand_primary min-[901px]:grid-cols-[1fr_1.08fr]">
        {/* ============ Brand panel (left) ============ */}
        <aside className="relative flex flex-col justify-start gap-[26px] overflow-hidden bg-brand_primary px-7 pb-[38px] pt-[34px] text-white min-[901px]:justify-between min-[901px]:gap-0 min-[901px]:px-[52px] min-[901px]:py-12">
          <div className="rt-pattern pointer-events-none absolute inset-0 opacity-5" aria-hidden="true" />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/genera/logo-horizontal-on-dark.svg"
            alt="Genera · Hub de Transformación"
            className="relative z-[1] h-[48px] w-auto self-start"
          />

          <div className="relative z-[1] max-w-[460px]">
            <p className="mb-5 text-[12px] font-semibold uppercase tracking-[.14em] text-brand_accent">
              Fundación Nueva Educación
            </p>
            <h1 className="m-0 font-black uppercase leading-[.98] tracking-[-.015em] text-white text-[clamp(34px,9vw,46px)] min-[901px]:text-[clamp(40px,4.4vw,56px)]">
              Súmate a
              <br />
              <span className="text-brand_accent">Genera</span>
            </h1>
            <p className="mt-[26px] max-w-[380px] text-[16px] font-normal leading-[1.6] text-white/[0.62]">
              Tu registro abre el acceso a la comunidad que está transformando la educación.
            </p>
          </div>

          <p className="relative z-[1] hidden text-[12px] font-medium text-white/40 min-[901px]:block">
            © 2026 Fundación Nueva Educación · Santiago, Chile
          </p>
        </aside>

        {/* ============ Form panel (right) ============ */}
        <section className="flex flex-col justify-center bg-white px-7 pb-12 pt-9 min-[901px]:px-[60px] min-[901px]:py-14">
          <div className="mx-auto w-full max-w-[560px]">
            {submitted ? (
              <div className="rt-rise flex flex-col items-start" role="status" aria-live="polite">
                <div className="mb-[22px] grid h-14 w-14 place-items-center rounded-full bg-brand_accent">
                  <Check className="text-brand_primary" width={26} height={26} strokeWidth={2.4} aria-hidden="true" />
                </div>
                <h2 className="mb-[10px] text-[26px] font-bold tracking-[-.01em] text-brand_primary">
                  Registro enviado
                </h2>
                <p className="m-0 max-w-[420px] text-[15px] leading-[1.6] text-gray-500">
                  Gracias, <strong className="font-semibold text-brand_primary">{successName}</strong>. Tu registro
                  quedó en revisión. Te escribiremos a{' '}
                  <strong className="font-semibold text-brand_primary">{successEmail}</strong> en cuanto tu acceso a
                  Genera esté habilitado.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <p className="mb-[10px] text-[12px] font-semibold uppercase tracking-[.14em] text-gray-400">
                  Registro
                </p>
                <h2 className="mb-2 text-[27px] font-bold tracking-[-.01em] text-brand_primary">
                  Completa tu registro
                </h2>
                <p className="mb-[30px] text-[15px] leading-[1.55] text-gray-500">
                  Estos datos permiten al equipo administrativo revisar y habilitar tu acceso.
                </p>

                {!schoolsAvailable && (
                  <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                    No se pudo cargar la lista de colegios. Intenta nuevamente más tarde.
                  </div>
                )}

                {/* Honeypot — kept hidden, must stay empty for the server to accept the submission. */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="website">Sitio web</label>
                  <input
                    id="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(event) => updateField('website', event.target.value)}
                    data-testid="registro-website"
                  />
                </div>

                <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] min-[541px]:grid-cols-2">
                  <Field id="firstName" label="Nombre" required error={errors.firstName && ERROR_MESSAGES.firstName}>
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      maxLength={80}
                      placeholder="Tu nombre"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(event) => updateField('firstName', event.target.value)}
                      className={`${CONTROL_BASE} ${borderClasses(Boolean(errors.firstName))} text-brand_primary placeholder:text-gray-400`}
                      data-testid="registro-first-name"
                      required
                    />
                  </Field>

                  <Field id="lastName" label="Apellido" required error={errors.lastName && ERROR_MESSAGES.lastName}>
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      maxLength={80}
                      placeholder="Tu apellido"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(event) => updateField('lastName', event.target.value)}
                      className={`${CONTROL_BASE} ${borderClasses(Boolean(errors.lastName))} text-brand_primary placeholder:text-gray-400`}
                      data-testid="registro-last-name"
                      required
                    />
                  </Field>

                  <Field id="schoolId" label="Colegio" required full error={errors.schoolId && ERROR_MESSAGES.schoolId}>
                    <select
                      id="schoolId"
                      name="schoolId"
                      value={form.schoolId}
                      onChange={(event) => updateField('schoolId', event.target.value)}
                      className={`${CONTROL_BASE} ${borderClasses(Boolean(errors.schoolId))} rt-select cursor-pointer pr-[42px] ${form.schoolId ? 'text-brand_primary' : 'text-gray-500'}`}
                      data-testid="registro-school"
                      required
                      disabled={!schoolsAvailable}
                    >
                      <option value="">Selecciona tu colegio</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {selectedGenerations.length > 0 && (
                    <Field
                      id="generationId"
                      label="Generación"
                      full
                      hint="Opcional — si no conoces tu generación, puedes dejarlo en blanco."
                    >
                      <select
                        id="generationId"
                        name="generationId"
                        value={form.generationId}
                        onChange={(event) => updateField('generationId', event.target.value)}
                        className={`${CONTROL_BASE} ${borderClasses(false)} rt-select cursor-pointer pr-[42px] ${form.generationId ? 'text-brand_primary' : 'text-gray-500'}`}
                        data-testid="registro-generation"
                      >
                        <option value="">Aún no lo sé</option>
                        {selectedGenerations.map((generation) => (
                          <option key={generation.id} value={generation.id}>
                            {generation.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  <Field id="email" label="Correo electrónico" required error={errors.email && ERROR_MESSAGES.email}>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="nombre@colegio.cl"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      className={`${CONTROL_BASE} ${borderClasses(Boolean(errors.email))} text-brand_primary placeholder:text-gray-400`}
                      data-testid="registro-email"
                      required
                    />
                  </Field>

                  <Field
                    id="birthDate"
                    label="Fecha de nacimiento"
                    required
                    error={errors.birthDate && ERROR_MESSAGES.birthDate}
                  >
                    <input
                      id="birthDate"
                      name="birthDate"
                      type="date"
                      min="1900-01-01"
                      max={today}
                      value={form.birthDate}
                      onChange={(event) => updateField('birthDate', event.target.value)}
                      className={`${CONTROL_BASE} ${borderClasses(Boolean(errors.birthDate))} rt-date ${form.birthDate ? 'text-brand_primary' : 'text-gray-500'}`}
                      data-testid="registro-birth-date"
                      required
                    />
                  </Field>

                  <Field
                    id="profession"
                    label="Profesión"
                    required
                    error={errors.profession && ERROR_MESSAGES.profession}
                  >
                    <input
                      id="profession"
                      name="profession"
                      type="text"
                      maxLength={140}
                      placeholder="Ej. Profesora de Historia"
                      value={form.profession}
                      onChange={(event) => updateField('profession', event.target.value)}
                      className={`${CONTROL_BASE} ${borderClasses(Boolean(errors.profession))} text-brand_primary placeholder:text-gray-400`}
                      data-testid="registro-profession"
                      required
                    />
                  </Field>

                  <Field id="role" label="Rol" required error={errors.role && ERROR_MESSAGES.role}>
                    <select
                      id="role"
                      name="role"
                      value={form.role}
                      onChange={(event) => updateField('role', event.target.value as TractorSignupRole)}
                      className={`${CONTROL_BASE} ${borderClasses(Boolean(errors.role))} rt-select cursor-pointer pr-[42px] ${form.role ? 'text-brand_primary' : 'text-gray-500'}`}
                      data-testid="registro-role"
                      required
                    >
                      <option value="">Selecciona tu rol</option>
                      {(Object.keys(TRACTOR_ROLE_LABELS) as TractorSignupRole[]).map((role) => (
                        <option key={role} value={role}>
                          {TRACTOR_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <label
                  className={`rt-consent mt-[18px] flex cursor-pointer items-start gap-3 rounded-[10px] border bg-gray-50 px-4 py-[14px] transition-colors duration-[180ms] ${
                    errors.consent ? 'border-red-500' : 'border-gray-200'
                  }`}
                >
                  <input
                    id="acepto"
                    type="checkbox"
                    checked={form.consentAccepted}
                    onChange={(event) => updateField('consentAccepted', event.target.checked)}
                    className="rt-check relative mt-px h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-gray-400 bg-white transition-[background,border-color] duration-[150ms] checked:border-brand_primary checked:bg-brand_primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand_accent/[0.35]"
                    data-testid="registro-consent"
                    required
                  />
                  <span className="text-[13.5px] leading-[1.5] text-gray-600">
                    Acepto el tratamiento de mis datos personales conforme a la{' '}
                    <a
                      href="/privacidad"
                      target="_blank"
                      rel="noopener"
                      className="text-brand_primary underline underline-offset-2"
                    >
                      Ley 21.719
                    </a>
                    .
                  </span>
                </label>

                <div className="mt-[22px] flex flex-col-reverse items-stretch gap-4 min-[541px]:flex-row min-[541px]:items-center min-[541px]:justify-between min-[541px]:gap-[18px]">
                  <p className="flex items-center gap-[9px] text-[12.5px] leading-[1.4] text-gray-500 min-[541px]:max-w-[260px]">
                    <ShieldCheck
                      width={16}
                      height={16}
                      strokeWidth={1.75}
                      className="shrink-0 text-brand_accent_hover"
                      aria-hidden="true"
                    />
                    <span>Revisamos cada registro y te avisamos por correo al activar tu acceso.</span>
                  </p>

                  <button
                    type="submit"
                    disabled={isSubmitting || !schoolsAvailable}
                    className="rt-submit inline-flex w-full shrink-0 items-center justify-center gap-[10px] rounded-lg bg-brand_primary px-[22px] py-[13px] text-[15px] font-semibold text-white transition-colors duration-[180ms] hover:bg-brand_gray_dark disabled:cursor-not-allowed disabled:opacity-[.55] min-[541px]:w-auto"
                    data-testid="registro-submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 width={17} height={17} className="animate-spin" aria-hidden="true" />
                        Enviando…
                      </>
                    ) : (
                      <>
                        Enviar registro
                        <span className="rt-arrow inline-flex">
                          <ArrowRight width={17} height={17} strokeWidth={2} aria-hidden="true" />
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      <style jsx>{`
        /* The single approved Genera decorative background: a tiled G-hub mark. */
        .rt-pattern {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'><circle cx='17' cy='17' r='12' fill='none' stroke='%23fbbf24' stroke-width='1'/><line x1='17' y1='17' x2='29' y2='17' stroke='%23fbbf24' stroke-width='1'/><circle cx='17' cy='17' r='2.2' fill='%23fbbf24'/></svg>");
          background-size: 34px 34px;
        }
        /* Custom select chevron (no native arrow). */
        .rt-select {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
          background-repeat: no-repeat;
          background-position: right 12px center;
        }
        .rt-date::-webkit-calendar-picker-indicator {
          opacity: 0.55;
          cursor: pointer;
        }
        /* Custom consent checkbox: black box, yellow check drawn with a rotated border. */
        .rt-check::after {
          content: '';
          position: absolute;
          left: 6px;
          top: 2px;
          width: 5px;
          height: 10px;
          border: solid #fbbf24;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
          opacity: 0;
        }
        .rt-check:checked::after {
          opacity: 1;
        }
        /* Submit arrow nudge on hover. */
        .rt-arrow {
          transition: transform 0.2s ease;
        }
        .rt-submit:hover:not(:disabled) .rt-arrow {
          transform: translateX(3px);
        }
        /* Success entrance. */
        .rt-rise {
          animation: rt-rise 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes rt-rise {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </>
  );
}

function Field({
  id,
  label,
  required,
  full,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  full?: boolean;
  error?: string | false;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-[7px] ${full ? 'min-[541px]:col-span-2' : ''}`}>
      <label htmlFor={id} className="text-[13px] font-semibold text-brand_gray_dark">
        {label}
        {required && <span className="font-bold text-brand_accent_hover">{' *'}</span>}
      </label>
      {children}
      {error && (
        <span role="alert" data-testid={`error-${id}`} className="text-[12px] font-medium text-red-500">
          {error}
        </span>
      )}
      {!error && hint && <span className="text-[12px] font-medium text-gray-400">{hint}</span>}
    </div>
  );
}
