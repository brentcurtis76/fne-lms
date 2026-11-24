import React from 'react';
import type { GetServerSideProps } from 'next';
import MainLayout from '../../../components/layout/MainLayout';
import { PageHeader } from '../../../components/ui/kit';
import { CorreosNav } from '../../../components/correos/CorreosNav';
import { PickPeople } from '../../../components/correos/PickPeople';
import { correosAdminPage } from '../../../lib/correos-host/page-guard';

/**
 * Bring in platform users: only staff (an active role, a valid address, allowed by the outbound policy; never
 * a test school's user). Name and address are copied as they are now. Admins only.
 */

export const getServerSideProps: GetServerSideProps = (context) => correosAdminPage(context);

interface StaffRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

const nameOf = (row: StaffRow) => [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email;

export default function CorreosUsuarios() {
  return (
    <MainLayout
      currentPage="admin"
      pageTitle="Agregar usuarios de la plataforma"
      breadcrumbs={[{ label: 'Administración' }, { label: 'Correos' }, { label: 'Usuarios de la plataforma' }]}
    >
      <div data-testid="correos-usuarios" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Correos"
          title="Usuarios de la plataforma"
          description="Agrega a personas del equipo y de los colegios que tienen un rol activo. Se copian su nombre y su correo tal como están hoy."
        />
        <CorreosNav current="usuarios" />
        <PickPeople<StaffRow>
          api="/api/admin/correos/usuarios"
          idsField="user_ids"
          testPrefix="correos-usuarios"
          noun="usuarios"
          searchLabel="Buscar usuarios por correo o nombre"
          emptyTitle="Nadie coincide"
          emptyDescription="Solo aparecen usuarios con un rol activo y un correo válido."
          rowLabel={nameOf}
          columns={[
            { header: 'Nombre', primary: true, cell: (row) => <span className="font-semibold">{nameOf(row)}</span> },
            { header: 'Correo', cell: (row) => <span className="break-all">{row.email}</span> },
          ]}
        />
      </div>
    </MainLayout>
  );
}
