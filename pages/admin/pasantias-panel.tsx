import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { ClipboardList, Download, Loader2, RefreshCw } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import ParticipantDrawer from '../../components/pasantias-panel/ParticipantDrawer';
import {
  BulkBar,
  PRIMARY,
  PanelFilters,
  PanelTable,
  SECONDARY,
  SummaryTiles,
  type BulkChoice,
} from '../../components/pasantias-panel/PanelParts';
import { createServiceRoleClient, getServerSideUser } from '../../lib/api-auth';
import { ReportExporter } from '../../lib/exportUtils';
import {
  EMPTY_FILTERS,
  PANEL_API,
  PANEL_CSV_HEADERS,
  errorText,
  filterRows,
  filtersActive,
  logisticsBody,
  panelCsvRows,
  readJson,
  type PanelFilters as Filters,
} from '../../lib/pasantias/panel/client';
import {
  BULK_MAX,
  LETTER_ASSET_KINDS,
  LETTER_ASSET_LABELS,
  LETTER_ASSET_MAX_BYTES,
  summarize,
  type LetterAssetKind,
  type LetterAssetsState,
  type Logistics,
  type PanelRoster,
  type PanelRow,
} from '../../lib/pasantias/panel/types';
import { isGlobalAdmin } from '../../utils/roleUtils';

/**
 * PASANTÍAS PANEL — every traveller of the January 2027 cohort, from every
 * school, in one place: what the school sent, FNE's tracking (airfare,
 * lodging, program payments), private documents and the invitation letter.
 *
 * Same guard as `pages/admin/pasantia-participants.tsx`: the verified user,
 * then the global-admin check; the middleware already limits `/admin/*` to
 * admins and holds a forced password change. Every read and write goes through
 * `/api/admin/pasantias-panel`, which repeats both checks.
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

type Msg = { text: string; tone: 'info' | 'error' } | null;

function LetterImages({
  assets,
  onChange,
}: {
  assets: LetterAssetsState;
  onChange: (next: LetterAssetsState) => void;
}) {
  const [busy, setBusy] = useState<LetterAssetKind | null>(null);
  const [message, setMessage] = useState<Msg>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const upload = async (kind: LetterAssetKind) => {
    const file = inputs.current[kind]?.files?.[0];
    setMessage(null);
    if (!file) {
      setMessage({ text: 'Elige una imagen para subir.', tone: 'error' });
      return;
    }
    if (file.size > LETTER_ASSET_MAX_BYTES) {
      setMessage({ text: 'Sube una imagen PNG o JPG de hasta 2 MB.', tone: 'error' });
      return;
    }
    setBusy(kind);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('file', file);
      const response = await fetch(`${PANEL_API}/letter-assets`, { method: 'POST', body: form });
      const body = await readJson(response);
      if (response.status !== 201) {
        setMessage({ text: errorText(response.status, body, 'No pudimos subir la imagen.'), tone: 'error' });
        return;
      }
      onChange(body.letterAssets as LetterAssetsState);
      const input = inputs.current[kind];
      if (input) input.value = '';
      setMessage({ text: `${LETTER_ASSET_LABELS[kind]}: imagen guardada.`, tone: 'info' });
    } catch {
      setMessage({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const ready = assets.logo && assets.signature;
  return (
    <details className="rounded-lg border border-gray-200 bg-white p-4" data-testid="panel-letter-images" open={!ready}>
      <summary className="cursor-pointer font-mont text-base font-bold">
        Imágenes de la carta de invitación{' '}
        <span className="text-sm font-semibold text-gray-600" data-testid="panel-letter-images-state">
          {ready ? '· listas' : '· faltan imágenes'}
        </span>
      </summary>
      <p className="mt-2 text-sm text-gray-700">
        La carta lleva el logo del Instituto Relacional y la firma de quien la emite. Se guardan en un espacio
        privado y se suben una sola vez; puedes reemplazarlas cuando quieras.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {LETTER_ASSET_KINDS.map((kind) => (
          <div key={kind} className="rounded-md bg-gray-50 p-3">
            <label htmlFor={`panel-letter-image-${kind}`} className="block text-sm font-semibold">
              {LETTER_ASSET_LABELS[kind]}{' '}
              <span className="font-normal text-gray-700" data-testid={`panel-letter-image-state-${kind}`}>
                ({assets[kind] ? 'subida' : 'falta'})
              </span>
            </label>
            <input
              id={`panel-letter-image-${kind}`}
              data-testid={`panel-letter-image-${kind}`}
              ref={(element) => {
                inputs.current[kind] = element;
              }}
              type="file"
              accept=".png,.jpg,.jpeg"
              className="mt-1 block w-full text-sm"
            />
            <button
              type="button"
              data-testid={`panel-letter-image-upload-${kind}`}
              onClick={() => void upload(kind)}
              disabled={busy !== null}
              className={`mt-2 ${SECONDARY}`}
            >
              {busy === kind ? 'Subiendo…' : assets[kind] ? 'Reemplazar' : 'Subir'}
            </button>
          </div>
        ))}
      </div>
      {message ? (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          data-testid="panel-letter-images-msg"
          className={`mt-3 text-sm font-medium ${message.tone === 'error' ? 'text-red-800' : 'text-gray-900'}`}
        >
          {message.text}
        </p>
      ) : null}
    </details>
  );
}

export default function PasantiasPanelPage() {
  const [rows, setRows] = useState<PanelRow[]>([]);
  const [rosters, setRosters] = useState<PanelRoster[]>([]);
  const [letterAssets, setLetterAssets] = useState<LetterAssetsState>({ logo: false, signature: false });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [message, setMessage] = useState<Msg>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkKey, setBulkKey] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setListError(null);
    try {
      const response = await fetch(PANEL_API, { cache: 'no-store' });
      const body = await readJson(response);
      if (!response.ok) {
        setListError(errorText(response.status, body, 'No pudimos cargar el panel.'));
        return false;
      }
      const nextRows = (body.rows as PanelRow[]) ?? [];
      setRows(nextRows);
      setRosters((body.rosters as PanelRoster[]) ?? []);
      setLetterAssets((body.letterAssets as LetterAssetsState) ?? { logo: false, signature: false });
      // A selection only ever names people still on the list.
      const ids = new Set(nextRows.map((row) => row.participant.id));
      setSelected((current) => new Set(Array.from(current).filter((id) => ids.has(id))));
      return true;
    } catch {
      setListError('No pudimos conectar. Inténtalo de nuevo.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceRow = useCallback((next: PanelRow, roster?: PanelRoster) => {
    setRows((list) => list.map((row) => (row.participant.id === next.participant.id ? next : row)));
    if (roster) setRosters((list) => list.map((r) => (r.id === roster.id ? roster : r)));
  }, []);

  const visible = useMemo(() => filterRows(rows, rosters, filters), [rows, rosters, filters]);
  const summary = useMemo(() => summarize(rows, rosters), [rows, rosters]);
  const selectedVisible = useMemo(
    () => visible.filter((row) => selected.has(row.participant.id)).map((row) => row.participant.id),
    [visible, selected]
  );

  const quickChange = async (row: PanelRow, change: Partial<Logistics>) => {
    const id = row.participant.id;
    if (busyIds.has(id)) return;
    setBusyIds((current) => new Set(current).add(id));
    setMessage(null);
    // Show the choice at once; the stored row replaces it when the server answers,
    // and the previous row comes back if the save did not happen.
    replaceRow({ ...row, logistics: { ...row.logistics, ...change } });
    try {
      const response = await fetch(`${PANEL_API}/participants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logisticsBody(row.logistics, change)),
      });
      const body = await readJson(response);
      if (body.row) replaceRow(body.row as PanelRow, body.roster as PanelRoster | undefined);
      else if (!response.ok) replaceRow(row);
      if (!response.ok) {
        setMessage({
          text:
            response.status === 409
              ? `Otra persona cambió el seguimiento de ${row.participant.firstNames} ${row.participant.lastNames} recién. Te mostramos lo guardado; repite el cambio si corresponde.`
              : errorText(response.status, body, 'No pudimos guardar el cambio.'),
          tone: 'error',
        });
      }
    } catch {
      replaceRow(row);
      setMessage({ text: 'No pudimos conectar. El cambio no se guardó.', tone: 'error' });
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const applyBulk = async (choice: BulkChoice) => {
    if (bulkBusy || selectedVisible.length === 0) return;
    if (selectedVisible.length > BULK_MAX) {
      setMessage({ text: `Selecciona como máximo ${BULK_MAX} personas por vez.`, tone: 'error' });
      return;
    }
    setBulkBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${PANEL_API}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: selectedVisible, field: choice.field, value: choice.value }),
      });
      const body = await readJson(response);
      if (!response.ok) {
        setMessage({ text: errorText(response.status, body, 'No pudimos aplicar el cambio.'), tone: 'error' });
        return;
      }
      const changed = typeof body.changed === 'number' ? body.changed : 0;
      const reloaded = await load();
      setSelected(new Set());
      setBulkKey('');
      setMessage({
        text: `Cambio aplicado: ${changed} de ${selectedVisible.length} ${selectedVisible.length === 1 ? 'persona cambió' : 'personas cambiaron'} (el resto ya tenía ese valor).${reloaded ? '' : ' Actualiza el panel para verlo.'}`,
        tone: 'info',
      });
    } catch {
      setMessage({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    try {
      // `csvEscape` → `neutralizeSpreadsheetFormula` keeps school-typed text from running as a formula.
      ReportExporter.exportToCSV({
        filename: `pasantias-enero-2027-${new Date().toISOString().slice(0, 10)}`,
        title: 'Panel de pasantías — Enero 2027',
        headers: [...PANEL_CSV_HEADERS],
        data: panelCsvRows(visible, rosters),
        metadata: { totalRecords: visible.length },
      });
      setMessage({ text: `CSV exportado: ${visible.length} ${visible.length === 1 ? 'persona' : 'personas'}.`, tone: 'info' });
    } catch {
      setMessage({ text: 'No se pudo exportar el CSV.', tone: 'error' });
    }
  };

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAll = (checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const row of visible) {
        if (checked) next.add(row.participant.id);
        else next.delete(row.participant.id);
      }
      return next;
    });

  return (
    <MainLayout currentPage="pasantias-panel" pageTitle="Panel de pasantías">
      <div className="min-h-screen bg-gray-50">
        <ResponsiveFunctionalPageHeader
          icon={<ClipboardList className="h-6 w-6" />}
          title="Panel de pasantías"
          subtitle="Cohorte Enero 2027 · todas las personas, su seguimiento y sus documentos"
        >
          <button
            type="button"
            data-testid="panel-export"
            onClick={exportCsv}
            disabled={loading || visible.length === 0}
            className={SECONDARY}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </button>
          <button type="button" data-testid="panel-refresh" onClick={() => void load()} disabled={loading} className={SECONDARY}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </button>
        </ResponsiveFunctionalPageHeader>

        <div className="mx-auto max-w-[90rem] space-y-4 px-4 py-6">
          {listError ? (
            <div role="alert" data-testid="panel-error" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">{listError}</p>
              <button type="button" data-testid="panel-retry" onClick={() => void load()} className={`mt-2 ${PRIMARY}`}>
                Reintentar
              </button>
            </div>
          ) : null}

          <SummaryTiles summary={summary} />
          <LetterImages assets={letterAssets} onChange={setLetterAssets} />
          <PanelFilters
            filters={filters}
            rosters={rosters}
            onChange={setFilters}
            onClear={() => setFilters(EMPTY_FILTERS)}
            active={filtersActive(filters)}
          />

          {message ? (
            <p
              role={message.tone === 'error' ? 'alert' : 'status'}
              data-testid="panel-message"
              data-tone={message.tone}
              className={`rounded-md border p-3 text-sm font-medium ${
                message.tone === 'error' ? 'border-red-300 bg-red-50 text-red-800' : 'border-brand_accent bg-brand_accent/20'
              }`}
            >
              {message.text}
            </p>
          ) : null}

          <BulkBar
            count={selectedVisible.length}
            choiceKey={bulkKey}
            busy={bulkBusy}
            onChoiceKey={setBulkKey}
            onApply={(choice) => void applyBulk(choice)}
            onClear={() => setSelected(new Set())}
          />

          <p className="text-sm text-gray-700" data-testid="panel-count" aria-live="polite">
            {loading
              ? 'Cargando…'
              : `Mostrando ${visible.length} de ${rows.length} ${rows.length === 1 ? 'persona' : 'personas'}`}
          </p>

          {loading && rows.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-700" data-testid="panel-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando el panel…
            </p>
          ) : rows.length === 0 && !listError ? (
            <p data-testid="panel-empty" className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm">
              Aún no hay personas inscritas. Aparecerán aquí cuando los colegios completen su nómina (los enlaces se
              crean en «Nóminas de pasantes»).
            </p>
          ) : visible.length === 0 && rows.length > 0 ? (
            <p data-testid="panel-no-match" className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm">
              Ninguna persona coincide con los filtros.
            </p>
          ) : rows.length > 0 ? (
            <PanelTable
              rows={visible}
              rosters={rosters}
              selected={selected}
              busyIds={busyIds}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onOpen={setOpenId}
              onQuickChange={(row, change) => void quickChange(row, change)}
            />
          ) : null}
        </div>
      </div>

      {openId ? (
        <ParticipantDrawer
          participantId={openId}
          letterAssets={letterAssets}
          onClose={() => setOpenId(null)}
          onRowChanged={replaceRow}
        />
      ) : null}
    </MainLayout>
  );
}
