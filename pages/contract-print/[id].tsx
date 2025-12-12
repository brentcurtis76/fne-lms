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
  is_anexo?: boolean;
  parent_contrato_id?: string;
  anexo_numero?: number;
  anexo_fecha?: string;
  numero_participantes?: number;
  nombre_ciclo?: 'Primer Ciclo' | 'Segundo Ciclo' | 'Tercer Ciclo' | 'Equipo Directivo';
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
  programas: {
    nombre: string;
    descripcion: string;
    horas_totales: number;
    modalidad: string;
  };
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

  return (
    <>
      <Head>
        <title>Contrato {contrato.numero_contrato} - Fundación Nueva Educación</title>
        <style>{`
          /* ========================================
             PROFESSIONAL CONTRACT STYLES
             ======================================== */

          :root {
            --primary-color: #1a365d;
            --secondary-color: #2c5282;
            --accent-color: #ecc94b;
            --text-color: #2d3748;
            --light-gray: #f7fafc;
            --border-color: #e2e8f0;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            font-family: 'Georgia', 'Times New Roman', serif;
            color: var(--text-color);
            background: #f0f0f0;
            line-height: 1.6;
          }

          /* Print Controls - Hidden in Print */
          .print-controls {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
            padding: 16px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          }

          .print-controls h2 {
            margin: 0;
            color: white;
            font-size: 18px;
            font-weight: 500;
          }

          .print-controls-buttons {
            display: flex;
            gap: 12px;
          }

          .btn-print {
            background: var(--accent-color);
            color: var(--primary-color);
            border: none;
            padding: 10px 24px;
            font-size: 14px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .btn-print:hover {
            background: #d69e2e;
            transform: translateY(-1px);
          }

          .btn-back {
            background: transparent;
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
            padding: 10px 20px;
            font-size: 14px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-back:hover {
            background: rgba(255,255,255,0.1);
            border-color: rgba(255,255,255,0.5);
          }

          /* Page Container */
          .page-container {
            max-width: 850px;
            margin: 80px auto 40px;
            padding: 0 20px;
          }

          /* Contract Document */
          .contract-document {
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 60px 70px;
            min-height: 1100px;
          }

          /* Header */
          .contract-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid var(--primary-color);
            padding-bottom: 20px;
            margin-bottom: 30px;
          }

          .header-logo {
            flex: 1;
          }

          .logo-placeholder {
            display: flex;
            flex-direction: column;
          }

          .logo-text {
            font-size: 12px;
            letter-spacing: 3px;
            color: var(--secondary-color);
            font-weight: 400;
          }

          .logo-text-large {
            font-size: 22px;
            font-weight: 700;
            color: var(--primary-color);
            letter-spacing: 1px;
          }

          .header-info {
            text-align: right;
            font-size: 11px;
            color: #718096;
          }

          .header-info p {
            margin: 2px 0;
          }

          .header-rut {
            font-weight: 600;
            color: var(--text-color);
          }

          /* Contract Title */
          .contract-title {
            text-align: center;
            margin: 40px 0 30px;
          }

          .contract-title h1 {
            font-size: 24px;
            font-weight: 700;
            color: var(--primary-color);
            margin: 0 0 10px;
            letter-spacing: 2px;
            text-transform: uppercase;
          }

          .contract-number {
            font-size: 16px;
            color: var(--secondary-color);
            font-weight: 600;
            background: var(--light-gray);
            display: inline-block;
            padding: 8px 24px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
          }

          /* Parties Section */
          .parties-section {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            gap: 20px;
            margin: 30px 0;
            align-items: stretch;
          }

          .party-box {
            background: var(--light-gray);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
          }

          .party-label {
            font-size: 11px;
            font-weight: 700;
            color: var(--secondary-color);
            letter-spacing: 2px;
            margin-bottom: 10px;
            text-transform: uppercase;
          }

          .party-content {
            font-size: 13px;
            line-height: 1.6;
          }

          .party-content strong {
            color: var(--primary-color);
            font-size: 14px;
          }

          .party-connector {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 700;
            color: var(--secondary-color);
          }

          /* Contract Date */
          .contract-date {
            text-align: center;
            font-size: 14px;
            margin: 30px 0;
            padding: 15px;
            background: linear-gradient(to right, transparent, var(--light-gray), transparent);
          }

          .contract-date strong {
            color: var(--primary-color);
          }

          /* Contract Body */
          .contract-body {
            margin-top: 30px;
          }

          /* Clauses */
          .clause {
            margin-bottom: 25px;
            page-break-inside: avoid;
          }

          .clause-header {
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border-color);
          }

          .clause-number {
            font-weight: 700;
            color: var(--primary-color);
            font-size: 13px;
            text-transform: uppercase;
          }

          .clause-title {
            font-weight: 600;
            color: var(--secondary-color);
            font-size: 13px;
            margin-left: 8px;
            text-transform: uppercase;
          }

          .clause-content {
            font-size: 12px;
            line-height: 1.7;
            text-align: justify;
          }

          .clause-content p {
            margin: 0 0 12px;
          }

          .clause-content p:last-child {
            margin-bottom: 0;
          }

          /* Legal Lists */
          .legal-list {
            margin: 12px 0;
            padding-left: 24px;
          }

          .legal-list li {
            margin-bottom: 8px;
            text-align: justify;
          }

          .legal-list.alpha {
            list-style-type: lower-alpha;
          }

          /* Amount Box */
          .amount-box {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 8px;
            text-align: center;
            margin: 20px 0;
          }

          .amount-label {
            display: block;
            font-size: 11px;
            letter-spacing: 2px;
            opacity: 0.9;
            margin-bottom: 8px;
            text-transform: uppercase;
          }

          .amount-value {
            display: block;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 1px;
          }

          /* Payment Schedule Table */
          .payment-schedule {
            margin: 20px 0;
            overflow: hidden;
            border-radius: 8px;
            border: 1px solid var(--border-color);
          }

          .cuotas-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          .cuotas-table thead {
            background: var(--primary-color);
            color: white;
          }

          .cuotas-table th {
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
            letter-spacing: 1px;
            text-transform: uppercase;
          }

          .cuotas-table td {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color);
          }

          .cuotas-table tbody tr:nth-child(even) {
            background: var(--light-gray);
          }

          .cuotas-table tbody tr:last-child td {
            border-bottom: none;
          }

          /* Vigencia Box */
          .vigencia-box {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            background: var(--light-gray);
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            border: 1px solid var(--border-color);
          }

          .vigencia-item {
            text-align: center;
          }

          .vigencia-label {
            display: block;
            font-size: 11px;
            color: #718096;
            margin-bottom: 5px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .vigencia-value {
            display: block;
            font-size: 16px;
            font-weight: 700;
            color: var(--primary-color);
          }

          /* Signatures Section */
          .signatures-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 60px;
            margin-top: 80px;
            padding-top: 40px;
            page-break-inside: avoid;
          }

          .signature-block {
            text-align: center;
          }

          .signature-line {
            width: 100%;
            height: 1px;
            background: var(--text-color);
            margin-bottom: 15px;
          }

          .signature-name {
            font-size: 14px;
            font-weight: 700;
            color: var(--primary-color);
            margin-bottom: 4px;
          }

          .signature-role {
            font-size: 11px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }

          .signature-entity {
            font-size: 12px;
            color: var(--text-color);
            font-weight: 500;
          }

          .signature-rut {
            font-size: 11px;
            color: #718096;
            margin-top: 4px;
          }

          /* Footer */
          .contract-footer {
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
            text-align: center;
            font-size: 10px;
            color: #a0aec0;
          }

          /* ========================================
             PRINT STYLES
             ======================================== */

          @media print {
            @page {
              size: letter;
              margin: 0.75in;
            }

            body {
              background: white;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .print-controls {
              display: none !important;
            }

            .page-container {
              margin: 0;
              padding: 0;
              max-width: none;
            }

            .contract-document {
              box-shadow: none;
              padding: 0;
            }

            .clause {
              page-break-inside: avoid;
            }

            .signatures-section {
              page-break-inside: avoid;
            }

            .amount-box {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .cuotas-table thead {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>
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
                      nombre_representante: contrato.parent_contract.clientes.nombre_representante,
                      rut_representante: contrato.parent_contract.clientes.rut_representante,
                      fecha_escritura: contrato.parent_contract.clientes.fecha_escritura,
                      nombre_notario: contrato.parent_contract.clientes.nombre_notario,
                      comuna_notaria: contrato.parent_contract.clientes.comuna_notaria,
                    },
                    programa: {
                      nombre: contrato.parent_contract.programas.nombre,
                      descripcion: contrato.parent_contract.programas.descripcion,
                      horas_totales: contrato.parent_contract.programas.horas_totales,
                      modalidad: contrato.parent_contract.programas.modalidad,
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
                    nombre_representante: contrato.clientes.nombre_representante,
                    rut_representante: contrato.clientes.rut_representante,
                    fecha_escritura: contrato.clientes.fecha_escritura,
                    nombre_notario: contrato.clientes.nombre_notario,
                    comuna_notaria: contrato.clientes.comuna_notaria,
                  },
                  programa: {
                    nombre: contrato.programas.nombre,
                    descripcion: contrato.programas.descripcion,
                    horas_totales: contrato.programas.horas_totales,
                    modalidad: contrato.programas.modalidad,
                  },
                  cuotas: contrato.cuotas
                })
          }}
        />
      </div>
    </>
  );
}
