import type { GetServerSideProps } from 'next';
import React, { useState } from 'react';
import { Briefcase, Download } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { createServiceRoleClient, getServerSideUser } from '../../lib/api-auth';
import { confirmedEmail, loadMyPasantias, type MyPasantia } from '../../lib/pasantias/panel/mine';
import { DOCUMENT_KIND_LABELS, FLIGHT_DATE_LABELS } from '../../lib/pasantias/panel/types';
import { logIntakeFailure } from '../../lib/pasantias/participants/server';

/**
 * MI PASANTÍA — what a traveller of the January 2027 pasantías sees about
 * their own trip once they sign in: program, school, flight dates, the state
 * of their airfare and lodging, and their ticket and invitation letter.
 *
 * Any signed-in account may open the page. It shows a pasantía only when the
 * account's CONFIRMED email equals the email registered for a traveller; the
 * lookup starts from the session, never from the URL. The middleware already
 * holds a forced password change for `/profile/*`.
 */
interface Props {
  pasantias: MyPasantia[];
  loadFailed: boolean;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const user = await getServerSideUser(ctx);
  if (!user) {
    return { redirect: { destination: '/login?next=%2Fprofile%2Fpasantia', permanent: false } };
  }
  ctx.res.setHeader('Cache-Control', 'no-store');
  const email = confirmedEmail(user);
  if (!email) return { props: { pasantias: [], loadFailed: false } };
  const mine = await loadMyPasantias(createServiceRoleClient(), email);
  // Explicit `=== false`: tsconfig has strict off (see the intake routes).
  if (mine.ok === false) {
    logIntakeFailure('mi pasantia page read failed', mine.error);
    return { props: { pasantias: [], loadFailed: true } };
  }
  return { props: { pasantias: mine.value, loadFailed: false } };
};

/** `2027-01-10` → `10 de enero de 2027`. */
function longDate(iso: string | null): string {
  if (!iso) return 'Por confirmar';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return 'Por confirmar';
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${Number(match[3])} de ${months[Number(match[2]) - 1]} de ${match[1]}`;
}

function Fact({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 text-base text-brand_primary">
        {value}
      </dd>
    </div>
  );
}

function PasantiaCard({ pasantia }: { pasantia: MyPasantia }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = pasantia.participantId;

  const download = async (docId: string) => {
    setBusy(docId);
    setError(null);
    try {
      const response = await fetch(`/api/pasantias/mine/documents/${docId}`, { credentials: 'same-origin' });
      const body = (await response.json().catch(() => ({}))) as { url?: unknown };
      if (!response.ok || typeof body.url !== 'string') {
        setError('No pudimos abrir el documento. Inténtalo de nuevo.');
        return;
      }
      // The link answers `Content-Disposition: attachment`, so this downloads without leaving the page.
      window.location.assign(body.url);
    } catch {
      setError('No pudimos abrir el documento. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      data-testid={`mi-pasantia-card-${id}`}
      aria-labelledby={`mi-pasantia-title-${id}`}
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h2 id={`mi-pasantia-title-${id}`} className="font-mont text-xl font-bold text-brand_primary">
        {pasantia.programName} · Barcelona
      </h2>
      <p data-testid={`mi-pasantia-dates-${id}`} className="mt-1 text-sm text-gray-700">
        Se realizará {pasantia.programDates}.
      </p>

      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Participante" value={pasantia.fullName} testId={`mi-pasantia-name-${id}`} />
        <Fact label="Colegio" value={pasantia.schoolName} testId={`mi-pasantia-school-${id}`} />
      </dl>

      <h3 className="mt-6 text-sm font-bold text-brand_primary">Tu viaje</h3>
      <dl className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={FLIGHT_DATE_LABELS.sclDepartureDate} value={longDate(pasantia.sclDepartureDate)} testId={`mi-pasantia-scl-departure-${id}`} />
        <Fact label={FLIGHT_DATE_LABELS.bcnArrivalDate} value={longDate(pasantia.bcnArrivalDate)} testId={`mi-pasantia-bcn-arrival-${id}`} />
        <Fact label={FLIGHT_DATE_LABELS.bcnDepartureDate} value={longDate(pasantia.bcnDepartureDate)} testId={`mi-pasantia-bcn-departure-${id}`} />
        <Fact label={FLIGHT_DATE_LABELS.sclArrivalDate} value={longDate(pasantia.sclArrivalDate)} testId={`mi-pasantia-scl-arrival-${id}`} />
      </dl>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Pasaje aéreo" value={pasantia.flightStatusLabel} testId={`mi-pasantia-flight-${id}`} />
        <Fact label="Alojamiento" value={pasantia.lodgingStatusLabel} testId={`mi-pasantia-lodging-${id}`} />
      </dl>
      {pasantia.lodgingLine ? (
        <p data-testid={`mi-pasantia-lodging-line-${id}`} className="mt-3 text-sm text-gray-800">
          Te hospedarás en {pasantia.lodgingLine.replace(/[.\s]+$/, '')}.
        </p>
      ) : null}

      <h3 className="mt-6 text-sm font-bold text-brand_primary">Tus documentos</h3>
      {pasantia.documents.length === 0 ? (
        <p data-testid={`mi-pasantia-no-documents-${id}`} className="mt-2 text-sm text-gray-700">
          Todavía no hay documentos. Aquí aparecerán tu pasaje y tu carta de invitación cuando estén listos.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200">
          {pasantia.documents.map((doc) => (
            <li key={doc.id} data-testid={`mi-pasantia-doc-${doc.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand_primary">{DOCUMENT_KIND_LABELS[doc.kind]}</p>
                <p className="truncate text-xs text-gray-600">{doc.fileName}</p>
              </div>
              <button
                type="button"
                data-testid={`mi-pasantia-doc-download-${doc.id}`}
                onClick={() => void download(doc.id)}
                disabled={busy !== null}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {busy === doc.id ? 'Abriendo…' : 'Descargar'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" data-testid={`mi-pasantia-error-${id}`} className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default function MiPasantiaPage({ pasantias, loadFailed }: Props) {
  return (
    <MainLayout currentPage="mi-pasantia" pageTitle="Mi pasantía">
      <div className="min-h-screen bg-gray-50">
        <ResponsiveFunctionalPageHeader
          icon={<Briefcase className="h-6 w-6" />}
          title="Mi pasantía"
          subtitle="Tu viaje a Barcelona · Enero 2027"
        />
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
          {loadFailed ? (
            <div role="alert" data-testid="mi-pasantia-load-error" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              No pudimos cargar tu pasantía. Vuelve a intentarlo en unos minutos.
            </div>
          ) : pasantias.length === 0 ? (
            <div data-testid="mi-pasantia-empty" className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-800">
              <p className="font-semibold">No encontramos una pasantía asociada a tu correo.</p>
              <p className="mt-1">
                Si viajas en enero de 2027, pide a quien coordina la pasantía en tu colegio que revise el correo con que
                te inscribió: debe ser el mismo con que entras a GENERA.
              </p>
            </div>
          ) : (
            pasantias.map((pasantia) => <PasantiaCard key={pasantia.participantId} pasantia={pasantia} />)
          )}
        </div>
      </div>
    </MainLayout>
  );
}
