import React, { useState } from 'react';
import type { GetServerSideProps } from 'next';
import MainLayout from '../../../components/layout/MainLayout';
import { Button, Card, CardBody, Notice, PageHeader } from '../../../components/ui/kit';
import { AddResult } from '../../../components/correos/AddResult';
import { CorreosNav } from '../../../components/correos/CorreosNav';
import { CsvFilePicker, type PickedFile } from '../../../components/correos/CsvFilePicker';
import { ListPicker } from '../../../components/correos/ListPicker';
import { EMPTY_REASON, ReasonFields, reasonBody, reasonComplete, type ReasonValue } from '../../../components/correos/ReasonFields';
import { callApi, failureText } from '../../../components/correos/api';
import type { AddCounts } from '../../../lib/correos/contacts';
import { correosAdminPage } from '../../../lib/correos-host/page-guard';

/**
 * CSV import: a file, one or more lists, and the reason for the whole file (no default). The server reads the
 * file and brings everyone in with one call; the result shows each count and that they add up. Admins only.
 */

export const getServerSideProps: GetServerSideProps = (context) => correosAdminPage(context);

export default function CorreosImportar() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [listIds, setListIds] = useState<string[]>([]);
  const [reason, setReason] = useState<ReasonValue>({ ...EMPTY_REASON });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<AddCounts | null>(null);

  const ready = Boolean(file) && listIds.length > 0 && reasonComplete(reason);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!file) return setError('Elige un archivo.');
    if (listIds.length === 0) return setError('Elige al menos una lista.');
    if (!reasonComplete(reason)) return setError('Indica de dónde viene el permiso y escribe la nota. Vale para todo el archivo.');
    setSending(true);
    setCounts(null);
    const answer = await callApi<{ counts: AddCounts }>('/api/admin/correos/importar', {
      method: 'POST',
      body: { csv: file.text, list_ids: listIds, ...reasonBody(reason) },
    });
    setSending(false);
    if (answer.status === 200 && answer.body) {
      setCounts(answer.body.counts);
      setFile(null);
    } else if (answer.status === 413) {
      setError('El archivo es demasiado grande (más de 8 MB). No se importó nada: divídelo en archivos más pequeños.');
    } else setError(failureText(answer));
  };

  return (
    <MainLayout
      currentPage="admin"
      pageTitle="Importar contactos"
      breadcrumbs={[{ label: 'Administración' }, { label: 'Correos' }, { label: 'Importar archivo' }]}
    >
      <div data-testid="correos-importar" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Correos"
          title="Importar un archivo"
          description="Agrega muchas personas de una vez desde un archivo CSV. Las direcciones bloqueadas y quienes se dieron de baja no se agregan."
        />
        <CorreosNav current="importar" />

        {counts ? (
          <div className="mt-6">
            <AddResult counts={counts} />
            <Button className="mt-4" variant="outline" onClick={() => setCounts(null)} data-testid="correos-importar-otro">
              Importar otro archivo
            </Button>
          </div>
        ) : (
          <Card className="mt-6">
            <CardBody>
              <form onSubmit={start} noValidate className="flex flex-col gap-6">
                <CsvFilePicker file={file} onFile={setFile} disabled={sending} />
                <ListPicker idPrefix="correos-importar" value={listIds} onChange={setListIds} />
                <ReasonFields
                  idPrefix="correos-importar"
                  value={reason}
                  onChange={setReason}
                  basisHelp="Vale para todas las personas del archivo. Se guarda junto a cada una, con la fecha de hoy y tu nombre."
                />
                {error ? (
                  <Notice tone="error" title="No se importó nada." data-testid="correos-importar-error">
                    {error}
                  </Notice>
                ) : null}
                <div>
                  <Button type="submit" variant="primary" loading={sending} disabled={!ready} data-testid="correos-importar-empezar">
                    Importar
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
