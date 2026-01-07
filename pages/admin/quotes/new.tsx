import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import QuoteFormV2 from '../../../components/quotes/QuoteFormV2';
import { ArrowLeft, FileText } from 'lucide-react';
import { getUserPrimaryRole } from '../../../utils/roleUtils';

export default function NewQuotePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (quoteData: any) => {
    setSaving(true);
    try {
      const response = await fetch('/api/quotes/createV2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quoteData),
      });

      const result = await response.json();

      if (response.ok && result.quote) {
        // If it was sent (now "Generar Página Web"), handle differently
        if (quoteData.status === 'sent' && result.share_url) {
          const fullUrl = `${window.location.origin}${result.share_url}`;
          
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
          // For draft saves
          toast.success('Borrador guardado exitosamente');
        }
        
        // Redirect to quotes list after a short delay
        setTimeout(() => {
          router.push('/admin/quotes');
        }, 2000);
      } else {
        throw new Error(result.error || 'Error al crear la cotización');
      }
    } catch (error) {
      console.error('Error creating quote:', error);
      toast.error(error instanceof Error ? error.message : 'Error al crear la cotización');
      throw error; // Re-throw to let QuoteForm handle it
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <Head>
        <title>Nueva Cotización - Pasantías Barcelona | Genera</title>
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
                Nueva Cotización - Pasantía Barcelona
              </h1>
              <p className="text-gray-600 mt-2">
                Crea una propuesta personalizada para tu cliente
              </p>
            </div>
          </div>
        </div>

        {/* Quote Form */}
        <QuoteFormV2 onSubmit={handleSubmit} />
      </div>
    </MainLayout>
  );
}