import React, { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { Briefcase, Loader2, RefreshCw } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  OneTimeLinkPanel,
  RosterDetail,
  RosterTable,
} from '../../components/pasantias-intake/AdminRosterParts';
import { RequiredMark } from '../../components/pasantias-intake/ParticipantForm';
import { createServiceRoleClient, getServerSideUser } from '../../lib/api-auth';
import { PROGRAM_IDS, programById } from '../../lib/pasantias/cohort-public';
import {
  DEFAULT_VALID_DAYS,
  VALID_DAYS_OPTIONS,
  type AdminIntakeParticipant,
  type AdminRoster,
  type ValidDays,
} from '../../lib/pasantias/participants/types';
import { MESSAGES, normalizeSchoolName } from '../../lib/pasantias/participants/validation';
import { isGlobalAdmin } from '../../utils/roleUtils';

/**
 * PASANT-PARTICIPANT-INTAKE — FNE creates one private roster link per school
 * and program, shows it once, and reads what the school entered.
 *
 * Same guard as `pages/admin/pasantia-leads.tsx`: the verified user, then the
 * global-admin check; the middleware already limits `/admin/*` to admins and
 * holds a forced password change. Every read and write goes through
 * `/api/admin/pasantia-participants`, which repeats both checks.
 *
 * The link token exists only in this page's React state, from the create or
 * rotate response until the admin dismisses the panel or leaves the page.
 */

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getServerSideUser(ctx);
  if (!user) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  const service = createServiceRoleClient();
  const isAdmin = await isGlobalAdmin(service, user.id);
  if (!isAdmin) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return { props: {} };
};

const API = '/api/admin/pasantia-participants';

const FIELD =
  'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent';
const PRIMARY =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md bg-brand_primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand_gray_dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:cursor-not-allowed disabled:opacity-50';

interface LinkPanel {
  url: string;
  schoolName: string;
  rotated: boolean;
}

interface Confirm {
  action: 'rotate' | 'revoke';
  roster: AdminRoster;
  validDays: ValidDays;
}

function linkUrl(token: string): string {
  return `${window.location.origin}/pasantias/nomina#k=${token}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorText(status: number, body: Record<string, unknown>, fallback: string): string {
  if (status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (status === 403) return typeof body.error === 'string' ? body.error : 'No tienes permiso para esta acción.';
  return typeof body.error === 'string' ? body.error : fallback;
}

export default function PasantiaParticipantsAdminPage() {
  const [rosters, setRosters] = useState<AdminRoster[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [schoolName, setSchoolName] = useState('');
  const [program, setProgram] = useState('');
  const [validDays, setValidDays] = useState<ValidDays>(DEFAULT_VALID_DAYS);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<{ text: string; rosterId: string | null } | null>(null);

  const [linkPanel, setLinkPanel] = useState<LinkPanel | null>(null);
  const [detail, setDetail] = useState<{ roster: AdminRoster; participants: AdminIntakeParticipant[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [acting, setActing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const response = await fetch(API, { cache: 'no-store' });
      const body = await readJson(response);
      if (!response.ok) {
        setListError(errorText(response.status, body, 'No pudimos cargar las nóminas.'));
        return;
      }
      setRosters((body.rosters as AdminRoster[]) ?? []);
      setTotal(typeof body.total === 'number' ? body.total : 0);
    } catch {
      setListError('No pudimos conectar. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const replaceRoster = (next: AdminRoster) => {
    setRosters((list) => {
      const index = list.findIndex((r) => r.id === next.id);
      if (index === -1) return [next, ...list];
      const copy = list.slice();
      copy[index] = next;
      return copy;
    });
    setDetail((current) => (current && current.roster.id === next.id ? { ...current, roster: next } : current));
  };

  const openDetail = async (rosterId: string) => {
    setDetailLoading(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${API}/${rosterId}`, { cache: 'no-store' });
      const body = await readJson(response);
      if (!response.ok) {
        setActionMessage(errorText(response.status, body, 'No pudimos cargar la nómina.'));
        return;
      }
      setDetail({
        roster: body.roster as AdminRoster,
        participants: (body.participants as AdminIntakeParticipant[]) ?? [],
      });
    } catch {
      setActionMessage('No pudimos conectar. Inténtalo de nuevo.');
    } finally {
      setDetailLoading(false);
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;
    const errors: Record<string, string> = {};
    // The API's own rule: NFC, collapsed, 2–160 Unicode code points.
    if (!normalizeSchoolName(schoolName)) errors.schoolName = MESSAGES.schoolNameInvalid;
    if (!program) errors.program = 'Elige un programa.';
    setFormErrors(errors);
    setCreateError(null);
    if (Object.keys(errors).length > 0) {
      document.getElementById(errors.schoolName ? 'intake-admin-school' : 'intake-admin-program')?.focus();
      return;
    }
    setCreating(true);
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolName, program, validDays }),
      });
      const body = await readJson(response);
      if (response.status === 201) {
        const roster = body.roster as AdminRoster;
        setLinkPanel({ url: linkUrl(String(body.token)), schoolName: roster.schoolName, rotated: false });
        replaceRoster(roster);
        setTotal((n) => n + 1);
        setSchoolName('');
        setProgram('');
        setValidDays(DEFAULT_VALID_DAYS);
        return;
      }
      if (response.status === 409) {
        setCreateError({
          text: errorText(409, body, 'Ya existe una nómina para ese colegio y programa.'),
          rosterId: typeof body.rosterId === 'string' ? body.rosterId : null,
        });
        return;
      }
      if (response.status === 422 && body.fields && typeof body.fields === 'object') {
        setFormErrors(body.fields as Record<string, string>);
        return;
      }
      setCreateError({ text: errorText(response.status, body, 'No pudimos crear la nómina.'), rosterId: null });
    } catch {
      setCreateError({ text: 'No pudimos conectar. Inténtalo de nuevo.', rosterId: null });
    } finally {
      setCreating(false);
    }
  };

  const runConfirmed = async () => {
    if (!confirm || acting) return;
    setActing(true);
    setActionMessage(null);
    const { action, roster } = confirm;
    try {
      const response = await fetch(`${API}/${roster.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'rotate' ? { action, validDays: confirm.validDays } : { action }),
      });
      const body = await readJson(response);
      if (!response.ok) {
        setActionMessage(errorText(response.status, body, 'No pudimos completar la acción.'));
        return;
      }
      const next = body.roster as AdminRoster;
      replaceRoster(next);
      if (action === 'rotate') {
        setLinkPanel({ url: linkUrl(String(body.token)), schoolName: next.schoolName, rotated: true });
      } else {
        setActionMessage(`Enlace de ${next.schoolName} revocado. El colegio ya no puede abrir la nómina.`);
      }
      setConfirm(null);
    } catch {
      setActionMessage('No pudimos conectar. Inténtalo de nuevo.');
    } finally {
      setActing(false);
    }
  };

  return (
    <MainLayout currentPage="pasantia-participants" pageTitle="Nóminas de pasantes">
      <div className="min-h-screen bg-gray-50">
        <ResponsiveFunctionalPageHeader
          icon={<Briefcase className="h-6 w-6" />}
          title="Nóminas de pasantes"
          subtitle="Enlaces privados para que cada colegio complete su nómina"
        >
          <button
            type="button"
            data-testid="intake-admin-refresh"
            onClick={() => void loadList()}
            disabled={loading}
            className={SECONDARY}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </button>
        </ResponsiveFunctionalPageHeader>

        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
          {linkPanel ? (
            <OneTimeLinkPanel
              url={linkPanel.url}
              schoolName={linkPanel.schoolName}
              rotated={linkPanel.rotated}
              onDismiss={() => setLinkPanel(null)}
            />
          ) : null}

          <section aria-labelledby="intake-admin-create-title" className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 id="intake-admin-create-title" className="font-mont text-lg font-bold">
              Nueva nómina
            </h2>
            <form noValidate onSubmit={(e) => void create(e)} className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4" data-testid="intake-admin-create-form">
              <div className="md:col-span-2">
                <label htmlFor="intake-admin-school" className="block text-sm font-semibold">
                  Colegio
                  <RequiredMark />
                </label>
                <input
                  id="intake-admin-school"
                  data-testid="intake-admin-school"
                  type="text"
                  // maxLength counts UTF-16 units; 320 admits 160 code points of any plane.
                  // The 2–160 code-point rule itself is normalizeSchoolName's.
                  maxLength={320}
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  aria-invalid={Boolean(formErrors.schoolName)}
                  aria-describedby={formErrors.schoolName ? 'intake-admin-school-error' : undefined}
                  aria-required="true"
                  className={FIELD}
                />
                {formErrors.schoolName ? (
                  <p id="intake-admin-school-error" className="mt-1 text-sm text-red-700">
                    {formErrors.schoolName}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="intake-admin-program" className="block text-sm font-semibold">
                  Programa
                  <RequiredMark />
                </label>
                <select
                  id="intake-admin-program"
                  data-testid="intake-admin-program"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  aria-invalid={Boolean(formErrors.program)}
                  aria-describedby={formErrors.program ? 'intake-admin-program-error' : undefined}
                  aria-required="true"
                  className={FIELD}
                >
                  <option value="">Selecciona…</option>
                  {PROGRAM_IDS.map((id) => (
                    <option key={id} value={id}>
                      {programById(id).name}
                    </option>
                  ))}
                </select>
                {formErrors.program ? (
                  <p id="intake-admin-program-error" className="mt-1 text-sm text-red-700">
                    {formErrors.program}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="intake-admin-valid-days" className="block text-sm font-semibold">
                  Vigencia del enlace
                </label>
                <select
                  id="intake-admin-valid-days"
                  data-testid="intake-admin-valid-days"
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value) as ValidDays)}
                  className={FIELD}
                >
                  {VALID_DAYS_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} días
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-4 flex flex-wrap items-center gap-3">
                <button type="submit" data-testid="intake-admin-create" disabled={creating} className={PRIMARY}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Crear enlace
                </button>
                {createError ? (
                  <p role="alert" data-testid="intake-admin-create-error" className="text-sm font-medium text-red-700">
                    {createError.text}{' '}
                    {createError.rosterId ? (
                      <button
                        type="button"
                        data-testid="intake-admin-create-existing"
                        onClick={() => void openDetail(createError.rosterId as string)}
                        className="font-semibold underline"
                      >
                        Ver nómina existente
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </form>
          </section>

          <div role="status" aria-live="polite" data-testid="intake-admin-message" className={actionMessage ? 'rounded-md border border-gray-300 bg-white p-3 text-sm font-medium' : 'sr-only'}>
            {actionMessage ?? ''}
          </div>

          {detailLoading ? (
            <p className="flex items-center gap-2 text-sm text-gray-700">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando nómina…
            </p>
          ) : null}
          {detail ? (
            <RosterDetail roster={detail.roster} participants={detail.participants} onClose={() => setDetail(null)} />
          ) : null}

          <section aria-labelledby="intake-admin-list-title">
            <h2 id="intake-admin-list-title" className="mb-3 font-mont text-lg font-bold">
              Nóminas{' '}
              <span className="text-sm font-semibold text-gray-600" data-testid="intake-admin-total">
                ({total})
              </span>
            </h2>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
              </p>
            ) : listError ? (
              <p role="alert" className="text-sm font-medium text-red-700">
                {listError}
              </p>
            ) : (
              <RosterTable
                rosters={rosters}
                busy={acting || detailLoading}
                selectedId={detail?.roster.id ?? null}
                onView={(roster) => void openDetail(roster.id)}
                onRotate={(roster) => setConfirm({ action: 'rotate', roster, validDays: DEFAULT_VALID_DAYS })}
                onRevoke={(roster) => setConfirm({ action: 'revoke', roster, validDays: DEFAULT_VALID_DAYS })}
              />
            )}
          </section>
        </div>

        <Dialog open={confirm !== null} onOpenChange={(open) => (!open && !acting ? setConfirm(null) : undefined)}>
          <DialogContent data-testid="intake-admin-confirm">
            <DialogHeader>
              <DialogTitle>{confirm?.action === 'rotate' ? 'Crear un enlace nuevo' : 'Revocar el enlace'}</DialogTitle>
              <DialogDescription>
                {confirm?.action === 'rotate'
                  ? `El enlace actual de ${confirm?.roster.schoolName ?? ''} dejará de funcionar de inmediato. Los datos ya guardados se mantienen.`
                  : `${confirm?.roster.schoolName ?? ''} ya no podrá abrir ni editar su nómina. Los datos guardados se mantienen.`}
              </DialogDescription>
            </DialogHeader>
            {confirm?.action === 'rotate' ? (
              <div>
                <label htmlFor="intake-admin-rotate-days" className="block text-sm font-semibold">
                  Vigencia del nuevo enlace
                </label>
                <select
                  id="intake-admin-rotate-days"
                  data-testid="intake-admin-rotate-days"
                  value={confirm.validDays}
                  onChange={(e) => setConfirm({ ...confirm, validDays: Number(e.target.value) as ValidDays })}
                  className={FIELD}
                >
                  {VALID_DAYS_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} días
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              <button
                type="button"
                data-testid="intake-admin-confirm-cancel"
                onClick={() => setConfirm(null)}
                disabled={acting}
                className={SECONDARY}
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="intake-admin-confirm-ok"
                onClick={() => void runConfirmed()}
                disabled={acting}
                className={PRIMARY}
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {confirm?.action === 'rotate' ? 'Crear enlace nuevo' : 'Revocar'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
