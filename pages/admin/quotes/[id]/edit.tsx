import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../../components/layout/MainLayout';
import QuoteFormV2 from '../../../../components/quotes/QuoteFormV2';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';

export default function EditQuotePage() {
  const router = useRouter();
  const { id } = router.query;
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchQuote(id);
    }
  }, [id]);

  const fetchQuote = async (quoteId: string) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}`);
      const data = await response.json();
      
      if (response.ok && data.quote) {
        setQuote(data.quote);
      } else {
        toast.error(data.error || 'No se pudo cargar la cotización');
        router.push('/admin/quotes');
      }
    } catch (error) {
      console.error('Error fetching quote:', error);
      toast.error('Error al cargar la cotización');
      router.push('/admin/quotes');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (quoteData: any) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quoteData),
      });

      const result = await response.json();

      if (response.ok) {
        // If it was sent (now "Generar Página Web"), handle differently
        if (quoteData.status === 'sent' && quote.status !== 'sent') {
          const fullUrl = `${window.location.origin}/quote/${id}`;
          
          // Open the generated page in a new tab
          window.open(fullUrl, '_blank');
          
          // Show success message with copy URL functionality
          toast((t) => (
            <div className="flex items-center justify-between w-full">
              <div className="flex-1">
                <p className="font-semibold text-brand_accent">✅ Página web generada exitosamente</p>
                <p className="text-sm text-gray-600 mt-1">La propuesta se abrió en una nueva pestaña</p>
                <p className="text-xs text-gray-500 mt-2 break-all">{fullUrl}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(fullUrl);
                  toast.success('URL copiada al portapapeles', { duration: 2000 });
                  toast.dismiss(t.id);
                }}
                className="ml-4 px-3 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 transition-colors"
              >
                Copiar URL
              </button>
            </div>
          ), {
            duration: 10000,
            style: {
              maxWidth: '500px',
            },
          });
        } else {
          // For regular updates
          toast.success('Cotización actualizada exitosamente');
        }
        
        // Redirect to quotes list after a short delay
        setTimeout(() => {
          router.push('/admin/quotes');
        }, 2000);
      } else {
        throw new Error(result.error || 'Error al actualizar la cotización');
      }
    } catch (error) {
      console.error('Error updating quote:', error);
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la cotización');
      throw error; // Re-throw to let QuoteForm handle it
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Cargando cotización...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!quote) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Cotización no encontrada
            </h1>
            <p className="text-gray-600 mb-4">
              La cotización que intentas editar no existe o fue eliminada.
            </p>
            <Link
              href="/admin/quotes"
              className="inline-flex items-center text-brand_primary hover:text-gray-800"
            >
              <ArrowLeft className="mr-2" size={20} />
              Volver a cotizaciones
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Head>
        <title>Editar Cotización - {quote.client_name} | Genera</title>
      </Head>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/quotes"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="mr-2" size={20} />
            Volver a cotizaciones
          </Link>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <FileText className="mr-3" size={32} />
                Editar Cotización
              </h1>
              <p className="text-gray-600 mt-2">
                Editando cotización para: <strong>{quote.client_name}</strong>
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <a
                href={`/quote/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Ver cotización
              </a>
            </div>
          </div>
        </div>

        {/* Quote Form */}
        <QuoteFormV2 
          initialData={quote} 
          onSubmit={handleSubmit}
          isEditing={true}
        />
      </div>
    </MainLayout>
  );
}