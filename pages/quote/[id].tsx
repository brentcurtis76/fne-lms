import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import QuotePublicView from '../../components/quotes/QuotePublicView';
import { Loader2 } from 'lucide-react';

export default function PublicQuotePage() {
  const router = useRouter();
  const { id } = router.query;
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        setError(data.error || 'No se pudo cargar la cotización');
      }
    } catch (err) {
      console.error('Error fetching quote:', err);
      setError('Error al cargar la cotización');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Head>
          <title>Cargando Cotización - Fundación Nueva Educación</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando cotización...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Head>
          <title>Error - Fundación Nueva Educación</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="text-center max-w-md mx-auto px-6">
          <div className="bg-red-50 rounded-2xl p-8 border-2 border-red-200">
            <svg
              className="w-16 h-16 text-red-500 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Cotización no encontrada
            </h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="bg-black text-white rounded-full px-6 py-3 font-medium hover:bg-gray-800 transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Head>
          <title>Cotización no encontrada - Fundación Nueva Educación</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Cotización no disponible
          </h1>
          <p className="text-gray-600">
            La cotización que buscas no está disponible o ha sido eliminada.
          </p>
        </div>
      </div>
    );
  }

  const pageTitle = `Cotización Pasantía Barcelona - ${quote.client_name}`;
  const pageDescription = `Propuesta personalizada de pasantía educativa en Barcelona para ${quote.client_name}. ${quote.nights} noches, ${quote.num_pasantes} participantes.`;

  return (
    <>
      <Head>
        <title>{pageTitle} - Fundación Nueva Educación</title>
        <meta name="description" content={pageDescription} />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Fundación Nueva Educación" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <QuotePublicView quote={quote} />
    </>
  );
}