import React from 'react';
import type { GetServerSideProps } from 'next';
import MainLayout from '../../../components/layout/MainLayout';
import { PageHeader } from '../../../components/ui/kit';
import { CorreosNav } from '../../../components/correos/CorreosNav';
import { PickPeople } from '../../../components/correos/PickPeople';
import { formatDate } from '../../../lib/correos/labels';
import { correosAdminPage } from '../../../lib/correos-host/page-guard';

/**
 * Bring in pasantías leads: only those who ticked the optional newsletter box. The tick's date and notice
 * version are stored as the reason. Admins only.
 */

export const getServerSideProps: GetServerSideProps = (context) => correosAdminPage(context);

interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  institution: string | null;
  cohort: string | null;
  marketing_opt_in_at: string;
  marketing_notice_version: string;
}

const nameOf = (row: LeadRow) => [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email;

export default function CorreosPasantias() {
  return (
    <MainLayout
      currentPage="admin"
      pageTitle="Agregar interesados en pasantías"
      breadcrumbs={[{ label: 'Administración' }, { label: 'Correos' }, { label: 'Interesados en pasantías' }]}
    >
      <div data-testid="correos-pasantias" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Correos"
          title="Interesados en pasantías"
          description="Solo aparecen quienes marcaron, en el formulario de pasantías, la casilla para recibir el boletín."
        />
        <CorreosNav current="pasantias" />
        <PickPeople<LeadRow>
          api="/api/admin/correos/pasantias"
          idsField="lead_ids"
          testPrefix="correos-pasantias"
          noun="interesados"
          searchLabel="Buscar interesados por correo, nombre o institución"
          emptyTitle="Nadie coincide"
          emptyDescription="Solo aparecen quienes marcaron la casilla del boletín."
          allowed={['consent_form']}
          versionFromForm={false}
          basisHelp="Marcaron la casilla del boletín en el formulario. La fecha y la versión del aviso de cada persona se guardan tal como quedaron."
          rowLabel={nameOf}
          columns={[
            { header: 'Nombre', primary: true, cell: (row) => <span className="font-semibold">{nameOf(row)}</span> },
            { header: 'Correo', cell: (row) => <span className="break-all">{row.email}</span> },
            { header: 'Institución', cell: (row) => row.institution || '—' },
            { header: 'Marcó la casilla', cell: (row) => `${formatDate(row.marketing_opt_in_at)} (aviso ${row.marketing_notice_version})` },
          ]}
        />
      </div>
    </MainLayout>
  );
}
