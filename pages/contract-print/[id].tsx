import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { generateContractFromTemplate } from '../../lib/contract-template';
import { generateAnnexFromTemplate } from '../../lib/annex-template';
import Head from 'next/head';

interface Contrato {
  id: string;
  numero_contrato: string;
  fecha_contrato: string;
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

  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  if (loading) {
    return <div>Cargando contrato...</div>;
  }

  if (!contrato) {
    return <div>Contrato no encontrado</div>;
  }

  return (
    <>
      <Head>
        <title>Contrato {contrato.numero_contrato}</title>
        <style jsx global>{`
          @media print {
            @page {
              margin: 1.5in 1in 1.5in 1in;
              size: letter;
            }
            
            body { 
              margin: 0;
              font-size: 12pt;
              line-height: 1.5;
              -webkit-print-color-adjust: exact;
            }
            
            .no-print { 
              display: none !important; 
            }
            
            .print-container {
              margin: 0;
              padding: 2in 1.5in;
              min-height: 100vh;
              box-sizing: border-box;
            }
            
            .contract-content {
              margin-top: 0.5in;
              margin-bottom: 0.5in;
            }
            
            /* Hide browser headers and footers */
            @media print {
              html, body {
                height: initial !important;
                overflow: initial !important;
              }
            }
          }
          
          .contract-content {
            text-align: justify;
            line-height: 1.6;
          }
          
          .contract-content p:first-child,
          .contract-content div:first-child {
            text-align: center;
            font-weight: bold;
            margin-bottom: 1rem;
          }
        `}</style>
      </Head>
      
      <div className="max-w-4xl mx-auto p-8 bg-white print-container" style={{ fontFamily: 'serif' }}>
        {/* Print Button */}
        <div className="no-print mb-4">
          <button 
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Imprimir / Guardar como PDF
          </button>
        </div>

        {/* Contract Content */}
        <div className="space-y-6">
          <div 
            className="whitespace-pre-line leading-relaxed contract-content"
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
                    precio_total_uf: contrato.precio_total_uf,
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
      </div>
    </>
  );
}