import React, { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import MainLayout from '../../../../components/layout/MainLayout';
import { Button, LoadingBlock, Notice, PageHeader, useConfirm } from '../../../../components/ui/kit';
import { CorreosNav } from '../../../../components/correos/CorreosNav';
import { ContactDetails } from '../../../../components/correos/ContactDetails';
import { callApi, failureText } from '../../../../components/correos/api';
import type { ContactDetail } from '../../../../lib/correos/contacts';
import { correosAdminPage } from '../../../../lib/correos-host/page-guard';

/** One person's page, and «Borrar a esta persona» (asks first; cannot be undone). Admins only. */

export const getServerSideProps: GetServerSideProps<{ contactId: string }> = (context) =>
  correosAdminPage(context, { contactId: String(context.params?.id ?? '') });

export default function CorreosPersona({ contactId }: { contactId: string }) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'error' | 'neutral'; text: string } | null>(null);
  const { confirm, confirmDialog } = useConfirm('correos-borrar-confirmar');

  const load = useCallback(async () => {
    const answer = await callApi<{ contact: ContactDetail }>(`/api/admin/correos/contactos/${encodeURIComponent(contactId)}`);
    if (answer.status === 200 && answer.body) {
      setContact(answer.body.contact);
      setLoadError(null);
    } else setLoadError(failureText(answer));
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  const erase = async () => {
    const yes = await confirm({
      tone: 'danger',
      title: '¿Borrar a esta persona?',
      message:
        'Se borran su correo, su nombre y su organización, también de los envíos pasados, y sale de todas las listas. Su dirección queda bloqueada para siempre: nadie podrá volver a agregarla. No se puede deshacer.',
      confirmLabel: 'Borrar para siempre',
    });
    if (!yes) return;
    setErasing(true);
    const answer = await callApi<{ message: string }>('/api/admin/correos/contactos/borrar', {
      method: 'POST',
      body: { contact_id: contactId },
    });
    setErasing(false);
    if (answer.status === 200 && answer.body) {
      setOutcome({ tone: 'success', text: answer.body.message });
      load();
    } else setOutcome({ tone: 'error', text: failureText(answer) });
  };

  return (
    <MainLayout
      currentPage="admin"
      pageTitle="Contacto de correo"
      breadcrumbs={[{ label: 'Administración' }, { label: 'Correos' }, { label: 'Contactos', href: '/admin/correos/contactos' }, { label: 'Persona' }]}
    >
      <div data-testid="correos-persona-pagina" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Correos"
          title={contact?.email ?? (contact?.erased ? 'Persona borrada' : 'Persona')}
          description="Sus listas, el permiso registrado y si está bloqueada."
          actions={
            contact && !contact.erased ? (
              <Button variant="danger-outline" loading={erasing} onClick={erase} data-testid="correos-persona-borrar">
                Borrar a esta persona
              </Button>
            ) : null
          }
        />
        <CorreosNav current="contactos" />
        <p className="mt-4 text-sm">
          <Link href="/admin/correos/contactos" className="underline">
            Volver a contactos
          </Link>
        </p>

        {outcome ? (
          <Notice tone={outcome.tone} className="mt-4" data-testid="correos-persona-aviso">
            {outcome.text}
          </Notice>
        ) : null}

        <div className="mt-6">
          {loadError ? (
            <Notice tone="error" title="No se pudo mostrar a esta persona.">
              {loadError}
            </Notice>
          ) : contact ? (
            <ContactDetails contact={contact} />
          ) : (
            <LoadingBlock label="Cargando a la persona" />
          )}
        </div>
      </div>
      {confirmDialog}
    </MainLayout>
  );
}
