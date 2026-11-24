import React, { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import MainLayout from '../../../../components/layout/MainLayout';
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
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../components/ui/kit';
import { CorreosNav } from '../../../../components/correos/CorreosNav';
import { ListPicker } from '../../../../components/correos/ListPicker';
import { EMPTY_REASON, ReasonFields, reasonBody, reasonComplete, type ReasonValue } from '../../../../components/correos/ReasonFields';
import { callApi, failureText } from '../../../../components/correos/api';
import { isValidAddress } from '../../../../lib/correos/address';
import { formatDate } from '../../../../lib/correos/labels';
import { correosAdminPage } from '../../../../lib/correos-host/page-guard';

/** Correos contacts: search (server-side, 25 a page) and add one person. Admins only. */

export const getServerSideProps: GetServerSideProps = (context) => correosAdminPage(context);

interface ContactRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  created_at: string;
  blocked: boolean;
}

interface Page {
  items: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface PersonDraft {
  email: string;
  first_name: string;
  last_name: string;
  organization: string;
  list_ids: string[];
  reason: ReasonValue;
}

const EMPTY_PERSON: PersonDraft = { email: '', first_name: '', last_name: '', organization: '', list_ids: [], reason: EMPTY_REASON };

function fullName(row: { first_name: string | null; last_name: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(' ');
}

export default function CorreosContactos() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'warning' | 'neutral'; text: string; contactId: string | null } | null>(null);

  // The search waits for a short pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setResult(null);
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set('q', query);
    const answer = await callApi<Page>(`/api/admin/correos/contactos?${params.toString()}`);
    if (answer.status === 200 && answer.body) {
      setResult(answer.body);
      setLoadError(null);
    } else setLoadError(failureText(answer));
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  const addOne = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setFormError(null);
    if (!isValidAddress(draft.email)) return setFormError('Esa dirección de correo no es válida. Revísala.');
    if (draft.list_ids.length === 0) return setFormError('Elige al menos una lista.');
    if (!reasonComplete(draft.reason)) return setFormError('Indica de dónde viene el permiso y escribe la nota.');
    setSaving(true);
    const answer = await callApi<{ outcome: string; message: string; contactId: string | null }>('/api/admin/correos/contactos', {
      method: 'POST',
      body: {
        email: draft.email,
        first_name: draft.first_name,
        last_name: draft.last_name,
        organization: draft.organization,
        list_ids: draft.list_ids,
        ...reasonBody(draft.reason),
      },
    });
    setSaving(false);
    const body = answer.body;
    if ((answer.status === 200 || answer.status === 201) && body) {
      setOutcome({ tone: body.outcome === 'added' ? 'success' : 'neutral', text: body.message, contactId: body.contactId });
      setDraft(null);
      load();
    } else if (answer.status === 409 && body?.message) {
      setOutcome({ tone: 'warning', text: body.message, contactId: null });
      setDraft(null);
    } else {
      setFormError(body?.message ?? failureText(answer));
    }
  };

  return (
    <MainLayout
      currentPage="admin"
      pageTitle="Contactos de correo"
      breadcrumbs={[{ label: 'Administración' }, { label: 'Correos' }, { label: 'Contactos' }]}
    >
      <div data-testid="correos-contactos" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Correos"
          title="Contactos"
          description="Las personas a quienes podemos escribir. Busca por parte del correo, del nombre o de la organización."
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar personas..."
          searchLabel="Buscar personas"
          primaryAction={{
            label: 'Agregar persona',
            onClick: () => {
              setFormError(null);
              setDraft({ ...EMPTY_PERSON, reason: { ...EMPTY_REASON } });
            },
            'data-testid': 'correos-contactos-agregar',
          }}
        />
        <CorreosNav current="contactos" />

        {outcome ? (
          <Notice tone={outcome.tone} className="mt-4" data-testid="correos-contactos-aviso">
            {outcome.text}{' '}
            {outcome.contactId ? (
              <Link href={`/admin/correos/contactos/${outcome.contactId}`} className="font-semibold underline">
                Ver a la persona
              </Link>
            ) : null}
          </Notice>
        ) : null}

        <div className="mt-6">
          {loadError ? (
            <Notice tone="error" title="No se pudo buscar.">
              {loadError}
            </Notice>
          ) : !result ? (
            <LoadingBlock label="Buscando" />
          ) : result.items.length === 0 ? (
            <EmptyState
              title={query ? 'Nadie coincide con la búsqueda' : 'Todavía no hay contactos'}
              description={query ? 'Prueba con otra parte del correo o del nombre.' : 'Agrega una persona o importa un archivo.'}
            />
          ) : (
            <Table
              stackOnPhone
              aria-label="Contactos"
              footer={
                <Pagination
                  page={result.page}
                  pageSize={result.pageSize}
                  total={result.total}
                  onPageChange={setPage}
                  noun="personas"
                  data-testid="correos-contactos-paginas"
                />
              }
            >
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Correo</TableHeaderCell>
                  <TableHeaderCell>Nombre</TableHeaderCell>
                  <TableHeaderCell>Organización</TableHeaderCell>
                  <TableHeaderCell>Agregada</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.map((row) => (
                  <TableRow
                    key={row.id}
                    data-testid="correos-contacto-fila"
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/correos/contactos/${row.id}`)}
                  >
                    <TableCell primary label="Correo">
                      <Link href={`/admin/correos/contactos/${row.id}`} className="font-semibold underline-offset-2 hover:underline">
                        {row.email}
                      </Link>
                      {row.blocked ? (
                        <Badge tone="error" className="ml-2">
                          Bloqueada
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell label="Nombre">{fullName(row) || '—'}</TableCell>
                    <TableCell label="Organización">{row.organization || '—'}</TableCell>
                    <TableCell label="Agregada">{formatDate(row.created_at)}</TableCell>
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
        title="Agregar persona"
        size="wide"
        data-testid="correos-persona-dialogo"
        footer={
          <>
            <Button variant="quiet" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="correos-persona-form" loading={saving} data-testid="correos-persona-guardar">
              Agregar
            </Button>
          </>
        }
      >
        {draft ? (
          <form id="correos-persona-form" onSubmit={addOne} noValidate className="flex flex-col gap-4">
            {formError ? (
              <Notice tone="error" data-testid="correos-persona-error">
                {formError}
              </Notice>
            ) : null}
            <Field label="Correo" required>
              <Input
                type="email"
                autoComplete="off"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.currentTarget.value })}
                data-testid="correos-persona-correo"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input
                  maxLength={200}
                  value={draft.first_name}
                  onChange={(event) => setDraft({ ...draft, first_name: event.currentTarget.value })}
                  data-testid="correos-persona-nombre"
                />
              </Field>
              <Field label="Apellido">
                <Input
                  maxLength={200}
                  value={draft.last_name}
                  onChange={(event) => setDraft({ ...draft, last_name: event.currentTarget.value })}
                  data-testid="correos-persona-apellido"
                />
              </Field>
            </div>
            <Field label="Organización">
              <Input
                maxLength={200}
                value={draft.organization}
                onChange={(event) => setDraft({ ...draft, organization: event.currentTarget.value })}
                data-testid="correos-persona-organizacion"
              />
            </Field>
            <ListPicker idPrefix="correos-persona" value={draft.list_ids} onChange={(list_ids) => setDraft({ ...draft, list_ids })} />
            <ReasonFields idPrefix="correos-persona" value={draft.reason} onChange={(reason) => setDraft({ ...draft, reason })} />
          </form>
        ) : null}
      </Dialog>
    </MainLayout>
  );
}
