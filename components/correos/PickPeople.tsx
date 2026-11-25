import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  LoadingBlock,
  Notice,
  SearchInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../ui/kit';
import type { AddCounts } from '../../lib/correos/contacts';
import { formatCount, type Noun } from '../../lib/correos/labels';
import type { LegalBasis } from '../../lib/correos/reason';
import { AddResult } from './AddResult';
import { ListPicker } from './ListPicker';
import { Pager } from './Pager';
import { EMPTY_REASON, ReasonFields, firstReasonControl, focusControl, reasonBody, reasonMessage, type ReasonValue } from './ReasonFields';
import { callApi, failureText } from './api';

export interface PickColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  primary?: boolean;
}

/** How many pages the total makes (at least one). */
function pageCount(result: { total: number; pageSize: number }): number {
  return Math.max(1, Math.ceil(result.total / Math.max(1, result.pageSize)));
}

interface PageOf<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hidden?: number;
}

/**
 * Pick people offered by a route (search, 25 a page, ticks kept across pages), choose lists and state the
 * reason, then bring them in with one request. The route checks every id again.
 */
export function PickPeople<T extends { id: string }>({
  api,
  idsField,
  testPrefix,
  columns,
  noun,
  searchLabel,
  emptyTitle,
  emptyDescription,
  allowed,
  versionFromForm = true,
  basisHelp,
  rowLabel,
}: {
  api: string;
  idsField: 'user_ids' | 'lead_ids';
  testPrefix: string;
  columns: PickColumn<T>[];
  noun: Noun;
  searchLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  allowed?: readonly LegalBasis[];
  versionFromForm?: boolean;
  basisHelp?: React.ReactNode;
  rowLabel: (row: T) => string;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageOf<T> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, T>>(new Map());
  const [listIds, setListIds] = useState<string[]>([]);
  const [reason, setReason] = useState<ReasonValue>({ ...EMPTY_REASON });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<AddCounts | null>(null);
  const [showReasonErrors, setShowReasonErrors] = useState(false);

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
    const answer = await callApi<PageOf<T>>(`${api}?${params.toString()}`);
    if (answer.status === 200 && answer.body) {
      setResult(answer.body);
      setLoadError(null);
    } else setLoadError(failureText(answer));
  }, [api, page, query]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (row: T, checked: boolean) => {
    setPicked((current) => {
      const next = new Map(current);
      if (checked) next.set(row.id, row);
      else next.delete(row.id);
      return next;
    });
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (picked.size === 0) return setError('Marca al menos una persona.');
    if (listIds.length === 0) return setError('Elige al menos una lista.');
    const missing = reasonMessage(reason, { versionFromForm });
    if (missing) {
      setShowReasonErrors(true);
      setError(missing);
      focusControl(firstReasonControl(reason, testPrefix, { versionFromForm, allowed }));
      return;
    }
    setSending(true);
    const answer = await callApi<{ counts: AddCounts }>(api, {
      method: 'POST',
      body: { [idsField]: [...picked.keys()], list_ids: listIds, ...reasonBody(reason) },
    });
    setSending(false);
    if (answer.status === 200 && answer.body) {
      setCounts(answer.body.counts);
      setPicked(new Map());
      setShowReasonErrors(false);
    } else setError(failureText(answer));
  };

  if (counts) {
    return (
      <div className="mt-6">
        <AddResult counts={counts} noun={noun} />
        <Button className="mt-4" variant="outline" onClick={() => setCounts(null)} data-testid={`${testPrefix}-otra-vez`}>
          Agregar más personas
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="max-w-md">
        <SearchInput
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          data-testid={`${testPrefix}-buscar`}
        />
      </div>

      {loadError ? (
        <Notice tone="error" title="No se pudo cargar la lista.">
          {loadError}
        </Notice>
      ) : !result ? (
        <LoadingBlock label="Cargando" />
      ) : result.items.length === 0 ? (
        result.page > 1 || result.total > result.pageSize ? (
          // The database page held people, but none of them can be added (they are left out after the page is
          // read): the page buttons stay, so the admin can go on or back.
          <div className="overflow-hidden rounded-lg bg-white shadow nuevo:border nuevo:border-brand_primary/[0.12] nuevo:[box-shadow:none]">
            <p className="px-6 py-4 text-sm text-gray-900 nuevo:px-[14px]" data-testid={`${testPrefix}-pagina-vacia`}>
              {result.page < pageCount(result)
                ? 'Las personas de esta página no se pueden agregar. Pasa a la página siguiente para ver a las demás.'
                : 'Las personas de esta página no se pueden agregar, y no hay más páginas. Vuelve a la página anterior.'}
            </p>
            <Pager
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              onPageChange={setPage}
              noun={noun}
              data-testid={`${testPrefix}-paginas`}
            />
          </div>
        ) : (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        )
      ) : (
        <Table
          stackOnPhone
          aria-label={searchLabel}
          footer={
            <Pager
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              onPageChange={setPage}
              noun={noun}
              data-testid={`${testPrefix}-paginas`}
            />
          }
        >
          <TableHead>
            <TableRow>
              <TableHeaderCell>
                <span className="sr-only">Elegir</span>
              </TableHeaderCell>
              {columns.map((column) => (
                <TableHeaderCell key={column.header}>{column.header}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {result.items.map((row) => (
              <TableRow key={row.id} selected={picked.has(row.id)} data-testid={`${testPrefix}-fila`}>
                <TableCell label="Elegir">
                  <Checkbox
                    label={<span className="sr-only">Elegir a {rowLabel(row)}</span>}
                    checked={picked.has(row.id)}
                    onChange={(event) => toggle(row, event.currentTarget.checked)}
                    data-testid={`${testPrefix}-elegir`}
                  />
                </TableCell>
                {columns.map((column) => (
                  <TableCell key={column.header} label={column.header} primary={column.primary}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {result?.hidden ? (
        <p className="text-sm text-gray-700" data-testid={`${testPrefix}-ocultas`}>
          En esta página hay {formatCount(result.hidden)} {result.hidden === 1 ? 'persona que no se ofrece' : 'personas que no se ofrecen'}: no tienen
          un correo válido o están vinculadas a un colegio de prueba.
        </p>
      ) : null}

      <Card>
        <CardBody>
          <form onSubmit={add} noValidate className="flex flex-col gap-6">
            <p className="text-sm text-gray-900" data-testid={`${testPrefix}-elegidas`}>
              {picked.size === 0
                ? 'Todavía no marcaste a nadie.'
                : `Marcaste ${formatCount(picked.size)} ${picked.size === 1 ? 'persona' : 'personas'}.`}
            </p>
            <ListPicker idPrefix={testPrefix} value={listIds} onChange={setListIds} />
            <ReasonFields
              idPrefix={testPrefix}
              value={reason}
              onChange={setReason}
              allowed={allowed}
              versionFromForm={versionFromForm}
              basisHelp={basisHelp}
              showErrors={showReasonErrors}
            />
            {error ? (
              <Notice tone="error" title="No se agregó a nadie." data-testid={`${testPrefix}-error`}>
                {error}
              </Notice>
            ) : null}
            <div>
              <Button type="submit" variant="primary" loading={sending} data-testid={`${testPrefix}-agregar`}>
                Agregar a las listas
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
