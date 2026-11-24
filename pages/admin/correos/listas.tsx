import React, { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import MainLayout from '../../../components/layout/MainLayout';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Notice,
  PageHeader,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  useConfirm,
} from '../../../components/ui/kit';
import { CorreosNav } from '../../../components/correos/CorreosNav';
import { callApi, failureText } from '../../../components/correos/api';
import { correosAdminPage } from '../../../lib/correos-host/page-guard';

/** Correos lists: read all, add, rename, describe, public or not, archive. No delete. Admins only. */

export const getServerSideProps: GetServerSideProps = (context) => correosAdminPage(context);

interface ListRow {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  archived_at: string | null;
  subscribed: number;
}

interface Draft {
  id: string | null;
  name: string;
  description: string;
  is_public: boolean;
}

const API = '/api/admin/correos/listas';

export default function CorreosListas() {
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm('correos-listas-confirmar');

  const load = useCallback(async () => {
    const answer = await callApi<{ lists: ListRow[] }>(API);
    if (answer.status === 200 && answer.body) {
      setLists(answer.body.lists);
      setLoadError(null);
    } else setLoadError(failureText(answer));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    const body = { name: draft.name, description: draft.description, is_public: draft.is_public };
    const answer = draft.id
      ? await callApi(`${API}/${draft.id}`, { method: 'PATCH', body })
      : await callApi(API, { method: 'POST', body });
    setSaving(false);
    if (answer.status === 200 || answer.status === 201) {
      setNotice(draft.id ? 'Lista guardada.' : 'Lista creada.');
      setDraft(null);
      load();
    } else setFormError(failureText(answer));
  };

  const archive = async (list: ListRow) => {
    const yes = await confirm({
      title: `¿Archivar «${list.name}»?`,
      message: 'La lista deja de ofrecerse para agregar personas y ya no se puede cambiar. Nadie pierde su historial en ella.',
      confirmLabel: 'Archivar',
    });
    if (!yes) return;
    const answer = await callApi(`${API}/${list.id}`, { method: 'PATCH', body: { archive: true } });
    if (answer.status === 200) {
      setNotice('Lista archivada.');
      load();
    } else setNotice(failureText(answer));
  };

  return (
    <MainLayout
      currentPage="admin"
      pageTitle="Listas de correo"
      breadcrumbs={[{ label: 'Administración' }, { label: 'Correos' }, { label: 'Listas' }]}
    >
      <div data-testid="correos-listas" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Correos"
          title="Listas"
          description="Cada persona puede estar en una o más listas. Las listas no se borran: se archivan."
          primaryAction={{
            label: 'Nueva lista',
            onClick: () => {
              setFormError(null);
              setDraft({ id: null, name: '', description: '', is_public: false });
            },
            'data-testid': 'correos-listas-nueva',
          }}
        />
        <CorreosNav current="listas" />

        {notice ? (
          <Notice tone="neutral" className="mt-4" data-testid="correos-listas-aviso">
            {notice}
          </Notice>
        ) : null}

        <div className="mt-6">
          {loadError ? (
            <Notice tone="error" title="No se pudieron cargar las listas.">
              {loadError}
            </Notice>
          ) : !lists ? (
            <LoadingBlock label="Cargando las listas" />
          ) : lists.length === 0 ? (
            <EmptyState title="Todavía no hay listas" description="Crea la primera con «Nueva lista»." />
          ) : (
            <Table stackOnPhone aria-label="Listas de correo">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nombre</TableHeaderCell>
                  <TableHeaderCell>Pública</TableHeaderCell>
                  <TableHeaderCell align="right">Suscritas</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">Acciones</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lists.map((list) => (
                  <TableRow key={list.id} data-testid="correos-lista-fila" data-list-name={list.name}>
                    <TableCell primary label="Nombre">
                      <span className="font-semibold">{list.name}</span>
                      {list.description ? <span className="block text-xs text-gray-600">{list.description}</span> : null}
                    </TableCell>
                    <TableCell label="Pública">{list.is_public ? 'Sí' : 'No'}</TableCell>
                    <TableCell label="Suscritas" align="right">
                      <span data-testid="correos-lista-suscritas">{list.subscribed.toLocaleString('es-CL')}</span>
                    </TableCell>
                    <TableCell label="Estado">
                      {list.archived_at ? <Badge tone="neutral">Archivada</Badge> : <Badge tone="success">Activa</Badge>}
                    </TableCell>
                    <TableCell label="Acciones" align="right">
                      {list.archived_at ? null : (
                        <span className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setFormError(null);
                              setDraft({ id: list.id, name: list.name, description: list.description ?? '', is_public: list.is_public });
                            }}
                            data-testid="correos-lista-editar"
                          >
                            Editar
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => archive(list)} data-testid="correos-lista-archivar">
                            Archivar
                          </Button>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar lista' : 'Nueva lista'}
        data-testid="correos-lista-dialogo"
        footer={
          <>
            <Button variant="quiet" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="correos-lista-form" loading={saving} data-testid="correos-lista-guardar">
              Guardar
            </Button>
          </>
        }
      >
        {draft ? (
          <form id="correos-lista-form" onSubmit={save} className="flex flex-col gap-4">
            {formError ? (
              <Notice tone="error" data-testid="correos-lista-error">
                {formError}
              </Notice>
            ) : null}
            <Field label="Nombre" required>
              <Input
                value={draft.name}
                maxLength={200}
                onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                data-testid="correos-lista-nombre"
              />
            </Field>
            <Field label="Descripción" help="Para qué es la lista. Opcional.">
              <Textarea
                rows={3}
                maxLength={1000}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
                data-testid="correos-lista-descripcion"
              />
            </Field>
            <Switch
              label="Lista pública"
              help="Una lista pública podrá ofrecerse a las personas para que se suscriban solas."
              checked={draft.is_public}
              onChange={(event) => setDraft({ ...draft, is_public: event.currentTarget.checked })}
              data-testid="correos-lista-publica"
            />
          </form>
        ) : null}
      </Dialog>
      {confirmDialog}
    </MainLayout>
  );
}
