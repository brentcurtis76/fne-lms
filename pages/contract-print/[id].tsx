import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { generateContractFromTemplate } from '../../lib/contract-template';
import Head from 'next/head';

interface Contrato {
  id: string;
  numero_contrato: string;
  fecha_contrato: string;
  precio_total_uf: number;
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
              __html: generateContractFromTemplate({
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
              }).replace(/\n/g, '<br>')
            }}
          />
        </div>
      </div>
    </>
  );
}