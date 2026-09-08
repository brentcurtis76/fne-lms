import { CONTRACT_DOCUMENT_CSS, CONTRACT_PRINT_GUIDANCE } from '../../lib/contract-document';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import { generateContractFromTemplate } from '../../lib/contract-template';
import { generateAnnexFromTemplate } from '../../lib/annex-template';
import Head from 'next/head';

interface Contrato {
  id: string;
  numero_contrato: string;
  fecha_contrato: string;
  fecha_fin?: string;
  precio_total_uf: number;
  tipo_moneda?: 'UF' | 'CLP';
  es_manual?: boolean;
  descripcion_manual?: string;
  programa_id?: string | null;
  contrato_url?: string;
  is_anexo?: boolean;
  parent_contrato_id?: string;
  anexo_numero?: number;
  anexo_fecha?: string;
  numero_participantes?: number;
  nombre_ciclo?: 'Primer Ciclo' | 'Segundo Ciclo' | 'Tercer Ciclo' | 'Equipo Directivo';
  snapshot_nombre_representante?: string;
  snapshot_rut_representante?: string;
  clientes: {
    nombre_legal: string;
    nombre_fantasia: string;
    rut: string;
    direccion: string;
    comuna: string;
    ciudad: string;
    nombre_representante: string;
    rut_representante?: string;
    fecha_escritura?: string;
    nombre_notario?: string;
    comuna_notaria?: string;
  };
  programas?: {
    nombre: string;
    descripcion: string;
    horas_totales: number;
    modalidad: string;
  } | null;
  cuotas: Array<{
    numero_cuota: number;
    fecha_vencimiento: string;
    monto_uf: number;
  }>;
  parent_contract?: Contrato;
}

export default function ContractPrintPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { id } = router.query;
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadContrato();
    }
  }, [id]);

  const loadContrato = async () => {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          clientes(*),
          programas(*),
          cuotas(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;


      // If this is an annex, also load the parent contract
      if (data.is_anexo && data.parent_contrato_id) {
        const { data: parentData, error: parentError } = await supabase
          .from('contratos')
          .select(`
            *,
            clientes(*),
            programas(*),
            cuotas(*)
          `)
          .eq('id', data.parent_contrato_id)
          .single();

        if (!parentError) {
          data.parent_contract = parentData;
        }
      }

      setContrato(data);
    } catch (error) {
      console.error('Error loading contract:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando contrato...</p>
        </div>
      </div>
    );
  }

  if (!contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 text-xl">Contrato no encontrado</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Contracts imported from an external PDF (es_manual / no program) are not
  // regenerated from the FNE template — surface the original document instead.
  const isImportedSource = !contrato.is_anexo && (contrato.es_manual || !contrato.programas);
  if (isImportedSource) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="text-center max-w-md bg-white rounded-lg shadow p-8">
          <p className="text-gray-900 text-lg font-semibold mb-2">Contrato importado</p>
          <p className="text-gray-600 mb-6">
            Este contrato fue importado desde un documento externo, por lo que no se genera una versión desde plantilla.
          </p>
          {contrato.contrato_url ? (
            <a
              href={contrato.contrato_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Descargar documento original
            </a>
          ) : (
            <p className="text-sm text-gray-500">
              No hay un documento original cargado. Use &quot;Subir contrato&quot; para adjuntarlo.
            </p>
          )}
          <div className="mt-6">
            <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Contrato {contrato.numero_contrato} - Fundación Nueva Educación</title>
        <style>{CONTRACT_DOCUMENT_CSS}</style>
      </Head>

      {/* Print Controls Bar */}
      <div className="print-controls">
        <h2>Vista previa del contrato</h2>
        <div className="print-controls-buttons">
          <button
            onClick={() => router.back()}
            className="btn-back"
          >
            ← Volver
          </button>
          <button
            onClick={() => window.print()}
            className="btn-print"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <p className="print-guidance">{CONTRACT_PRINT_GUIDANCE}</p>

      {/* Contract Document */}
      <div className="page-container">
        <div
          dangerouslySetInnerHTML={{
            __html: contrato.is_anexo
                ? generateAnnexFromTemplate({
                  anexo_numero: contrato.anexo_numero,
                  anexo_fecha: contrato.anexo_fecha,
                  numero_participantes: contrato.numero_participantes,
                  nombre_ciclo: contrato.nombre_ciclo,
                  precio_total_uf: contrato.precio_total_uf,
                  tipo_moneda: contrato.tipo_moneda || 'UF',
                  cuotas: contrato.cuotas,
                  parentContract: contrato.parent_contract ? {
                    numero_contrato: contrato.parent_contract.numero_contrato,
                    fecha_contrato: contrato.parent_contract.fecha_contrato,
                    cliente: {
                      nombre_legal: contrato.parent_contract.clientes.nombre_legal,
                      nombre_fantasia: contrato.parent_contract.clientes.nombre_fantasia,
                      rut: contrato.parent_contract.clientes.rut,
                      direccion: contrato.parent_contract.clientes.direccion,
                      comuna: contrato.parent_contract.clientes.comuna,
                      ciudad: contrato.parent_contract.clientes.ciudad,
                      nombre_representante: contrato.parent_contract.snapshot_nombre_representante ?? contrato.parent_contract.clientes.nombre_representante,
                      rut_representante: contrato.parent_contract.snapshot_rut_representante ?? contrato.parent_contract.clientes.rut_representante,
                      fecha_escritura: contrato.parent_contract.clientes.fecha_escritura,
                      nombre_notario: contrato.parent_contract.clientes.nombre_notario,
                      comuna_notaria: contrato.parent_contract.clientes.comuna_notaria,
                    },
                    programa: {
                      nombre: contrato.parent_contract.programas?.nombre,
                      descripcion: contrato.parent_contract.programas?.descripcion,
                      horas_totales: contrato.parent_contract.programas?.horas_totales,
                      modalidad: contrato.parent_contract.programas?.modalidad,
                    }
                  } : undefined
                })
              : generateContractFromTemplate({
                  numero_contrato: contrato.numero_contrato,
                  fecha_contrato: contrato.fecha_contrato,
                  fecha_fin: contrato.fecha_fin,
                  precio_total_uf: contrato.precio_total_uf,
                  tipo_moneda: contrato.tipo_moneda,
                  cliente: {
                    nombre_legal: contrato.clientes.nombre_legal,
                    nombre_fantasia: contrato.clientes.nombre_fantasia,
                    rut: contrato.clientes.rut,
                    direccion: contrato.clientes.direccion,
                    comuna: contrato.clientes.comuna,
                    ciudad: contrato.clientes.ciudad,
                    nombre_representante: contrato.snapshot_nombre_representante ?? contrato.clientes.nombre_representante,
                    rut_representante: contrato.snapshot_rut_representante ?? contrato.clientes.rut_representante,
                    fecha_escritura: contrato.clientes.fecha_escritura,
                    nombre_notario: contrato.clientes.nombre_notario,
                    comuna_notaria: contrato.clientes.comuna_notaria,
                  },
                  programa: {
                    nombre: contrato.programas?.nombre,
                    descripcion: contrato.programas?.descripcion,
                    horas_totales: contrato.programas?.horas_totales,
                    modalidad: contrato.programas?.modalidad,
                  },
                  cuotas: contrato.cuotas
                })
          }}
        />
      </div>
    </>
  );
}
