import React, { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { createServiceRoleClient } from '../lib/api-auth';
import {
  SantaMartaSchool,
  TRACTOR_ROLE_LABELS,
  TractorSignupRole,
  getSantaMartaSchools,
  isValidBirthDate,
  isValidEmail,
  normalizeEmail,
  normalizeText,
} from '../lib/tractorSignups';

interface RegistroTractorProps {
  schools: SantaMartaSchool[];
  schoolLoadError: boolean;
}

interface FormState {
  firstName: string;
  lastName: string;
  schoolId: string;
  email: string;
  birthDate: string;
  profession: string;
  role: TractorSignupRole | '';
  consentAccepted: boolean;
  website: string;
}

const initialForm: FormState = {
  firstName: '',
  lastName: '',
  schoolId: '',
  email: '',
  birthDate: '',
  profession: '',
  role: '',
  consentAccepted: false,
  website: '',
};

export const getServerSideProps: GetServerSideProps<RegistroTractorProps> = async () => {
  try {
    const schools = await getSantaMartaSchools(createServiceRoleClient());
    return { props: { schools, schoolLoadError: false } };
  } catch (error) {
    console.error('[registro-tractor] Failed to load Santa Marta schools:', error);
    return { props: { schools: [], schoolLoadError: true } };
  }
};

export default function RegistroTractorPage({ schools, schoolLoadError }: RegistroTractorProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyGranted, setAlreadyGranted] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const schoolsAvailable = schools.length > 0 && !schoolLoadError;

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validateClient = () => {
    const firstName = normalizeText(form.firstName);
    const lastName = normalizeText(form.lastName);
    const email = normalizeEmail(form.email);
    const profession = normalizeText(form.profession);

    if (!firstName || !lastName || !form.schoolId || !email || !form.birthDate || !profession || !form.role) {
      toast.error('Completa todos los campos obligatorios');
      return false;
    }

    if (!isValidEmail(email)) {
      toast.error('Ingresa un correo válido');
      return false;
    }

    if (!isValidBirthDate(form.birthDate)) {
      toast.error('Ingresa una fecha de nacimiento válida');
      return false;
    }

    if (!form.consentAccepted) {
      toast.error('Debes aceptar el tratamiento de tus datos personales');
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateClient()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/tractor-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo enviar el registro');
      }

      setAlreadyGranted(Boolean(result.alreadyGranted));
      setSubmitted(true);
      toast.success('Registro recibido');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al enviar el registro');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Líderes de la Generación Tractor | Genera</title>
        <meta
          name="description"
          content="Registro para participantes del retiro docente Líderes de la Generación Tractor."
        />
      </Head>

      <main className="min-h-screen bg-[#f5f5f2] text-gray-900">
        <div className="grid min-h-screen lg:grid-cols-[0.92fr_1.08fr]">
          <section className="relative hidden overflow-hidden bg-[#0a0a0a] lg:block">
            <Image
              src="/images/tractor-photo.png"
              alt="Participantes de Generación Tractor"
              fill
              sizes="42vw"
              className="object-cover opacity-70"
              priority
            />
            <div className="absolute inset-0 bg-[#0a0a0a]/58" />
            <div className="relative z-10 flex h-full flex-col justify-between px-12 py-10 text-white">
              <Image
                src="/images/logo.png"
                alt="Fundación Nueva Educación"
                width={172}
                height={74}
                className="h-auto w-40"
                priority
              />
              <div className="max-w-xl pb-12">
                <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#fbbf24]">
                  Red Santa Marta
                </p>
                <h1 className="text-5xl font-semibold leading-tight">
                  Líderes de la Generación Tractor
                </h1>
                <p className="mt-5 max-w-lg text-lg leading-8 text-gray-100">
                  Registro de información personal para activar tu acceso a la plataforma Genera.
                </p>
              </div>
            </div>
          </section>

          <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
            <div className="w-full max-w-3xl">
              <div className="mb-7 flex items-center justify-between gap-4 lg:hidden">
                <Image
                  src="/images/logo.png"
                  alt="Fundación Nueva Educación"
                  width={144}
                  height={62}
                  className="h-auto w-32"
                  priority
                />
                <div className="rounded-md bg-[#0a0a0a] px-3 py-2 text-sm font-semibold text-[#fbbf24]">
                  Genera
                </div>
              </div>

              <div className="mb-7">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#9a6a00]">
                  Registro privado
                </p>
                <h2 className="text-3xl font-semibold text-[#0a0a0a] sm:text-4xl">
                  Líderes de la Generación Tractor
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-gray-700">
                  Completa tus datos para que el equipo administrativo pueda revisar tu registro y habilitar tu acceso.
                </p>
              </div>

              <div className="border border-gray-200 bg-white shadow-sm">
                {submitted ? (
                  <div className="px-6 py-12 text-center sm:px-10">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#fbbf24]/18 text-[#8a6100]">
                      <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <h3 className="text-2xl font-semibold text-[#0a0a0a]">
                      {alreadyGranted ? 'Tu acceso ya fue gestionado' : 'Registro recibido'}
                    </h3>
                    <p className="mx-auto mt-3 max-w-lg text-gray-700">
                      {alreadyGranted
                        ? 'Ya tenemos tu registro vinculado a un usuario de la plataforma.'
                        : 'Gracias. El equipo revisará tu información desde el panel de administración.'}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
                    {!schoolsAvailable && (
                      <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        No se pudo cargar la lista de colegios. Intenta nuevamente más tarde.
                      </div>
                    )}

                    <div className="hidden">
                      <label htmlFor="website">Sitio web</label>
                      <input
                        id="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.website}
                        onChange={(event) => updateField('website', event.target.value)}
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Nombre" htmlFor="firstName">
                        <input
                          id="firstName"
                          name="firstName"
                          type="text"
                          maxLength={80}
                          autoComplete="given-name"
                          value={form.firstName}
                          onChange={(event) => updateField('firstName', event.target.value)}
                          className={inputClassName}
                          required
                        />
                      </Field>

                      <Field label="Apellido" htmlFor="lastName">
                        <input
                          id="lastName"
                          name="lastName"
                          type="text"
                          maxLength={80}
                          autoComplete="family-name"
                          value={form.lastName}
                          onChange={(event) => updateField('lastName', event.target.value)}
                          className={inputClassName}
                          required
                        />
                      </Field>
                    </div>

                    <Field label="Colegio" htmlFor="schoolId">
                      <select
                        id="schoolId"
                        name="schoolId"
                        value={form.schoolId}
                        onChange={(event) => updateField('schoolId', event.target.value)}
                        className={inputClassName}
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

                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Correo electrónico" htmlFor="email">
                        <input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          value={form.email}
                          onChange={(event) => updateField('email', event.target.value)}
                          className={inputClassName}
                          required
                        />
                      </Field>

                      <Field label="Fecha de nacimiento" htmlFor="birthDate">
                        <input
                          id="birthDate"
                          name="birthDate"
                          type="date"
                          min="1900-01-01"
                          max={today}
                          value={form.birthDate}
                          onChange={(event) => updateField('birthDate', event.target.value)}
                          className={inputClassName}
                          required
                        />
                      </Field>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Profesión" htmlFor="profession">
                        <input
                          id="profession"
                          name="profession"
                          type="text"
                          maxLength={140}
                          value={form.profession}
                          onChange={(event) => updateField('profession', event.target.value)}
                          className={inputClassName}
                          required
                        />
                      </Field>

                      <Field label="Rol" htmlFor="role">
                        <select
                          id="role"
                          name="role"
                          value={form.role}
                          onChange={(event) => updateField('role', event.target.value as TractorSignupRole)}
                          className={inputClassName}
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

                    <label className="flex items-start gap-3 border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.consentAccepted}
                        onChange={(event) => updateField('consentAccepted', event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#0a0a0a] focus:ring-[#fbbf24]"
                        required
                      />
                      <span>
                        Acepto el tratamiento de mis datos personales conforme a la Ley 21.719.
                      </span>
                    </label>

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <ShieldCheck className="h-4 w-4 text-[#9a6a00]" aria-hidden="true" />
                        <span>Tu información será revisada por administradores globales.</span>
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting || !schoolsAvailable}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#0a0a0a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#242424] disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Enviando
                          </>
                        ) : (
                          <>
                            Enviar registro
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

const inputClassName =
  'block min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-sm outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70 disabled:cursor-not-allowed disabled:bg-gray-100 sm:text-sm';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-gray-800">
        {label}
      </label>
      {children}
    </div>
  );
}
