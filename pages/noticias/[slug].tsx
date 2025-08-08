import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Footer from '../../components/Footer';

interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  featured_image?: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
}

export default function ArticlePage() {
  const router = useRouter();
  const { slug } = router.query;
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (slug) {
      fetchArticle();
    }
  }, [slug]);

  const fetchArticle = async () => {
    try {
      const response = await fetch(`/api/news`);
      
      if (!response.ok) {
        setError('Error al cargar el artículo');
        return;
      }
      
      const data = await response.json();
      
      // Handle both response formats: direct array or object with articles property
      const articles = Array.isArray(data) ? data : (data.articles || []);
      
      if (!Array.isArray(articles)) {
        console.error('Invalid response format - expected array of articles, got:', data);
        setError('Error al cargar el artículo');
        return;
      }
      
      const foundArticle = articles.find((article: NewsArticle) => article.slug === slug);
      
      if (!foundArticle) {
        setError('Artículo no encontrado');
        return;
      }
      
      setArticle(foundArticle);
    } catch (error) {
      console.error('Error fetching article:', error);
      setError('Error al cargar el artículo');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Cargando artículo - Fundación Nueva Educación</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          
          {/* Google Fonts Inter */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
          
          {/* Tailwind CSS */}
          <script src="https://cdn.tailwindcss.com"></script>
          
          <style jsx>{`
            body {
              font-family: 'Inter', sans-serif;
            }
          `}</style>
        </Head>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-black"></div>
            <p className="mt-6 text-xl text-gray-600">Cargando artículo...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !article) {
    return (
      <>
        <Head>
          <title>Artículo no encontrado - Fundación Nueva Educación</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          
          {/* Google Fonts Inter */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
          
          {/* Tailwind CSS */}
          <script src="https://cdn.tailwindcss.com"></script>
          
          <style jsx>{`
            body {
              font-family: 'Inter', sans-serif;
            }
          `}</style>
        </Head>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-black uppercase mb-6">{error || 'Artículo No Encontrado'}</h1>
            <p className="text-lg text-gray-600 mb-8">El artículo que buscas no existe o ha sido eliminado.</p>
            <Link href="/noticias" className="inline-flex items-center border border-gray-300 rounded-full px-8 py-4 text-base font-medium hover:bg-gray-100 transition-all duration-300">
              <svg className="mr-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18"></path>
              </svg>
              Volver a Noticias
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{article.title} - Fundación Nueva Educación</title>
        <meta name="description" content={article.content_html.replace(/<[^>]*>/g, '').substring(0, 160)} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        {article.featured_image && <meta property="og:image" content={article.featured_image} />}
        
        {/* Google Fonts Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
        
        {/* Tailwind CSS */}
        <script src="https://cdn.tailwindcss.com"></script>
        
        <style jsx>{`
          body {
            font-family: 'Inter', sans-serif;
          }
          
          /* Custom scrollbar */
          ::-webkit-scrollbar {
            width: 8px;
          }
          ::-webkit-scrollbar-track {
            background: #f1f1f1;
          }
          ::-webkit-scrollbar-thumb {
            background: #000;
            border-radius: 4px;
          }
          
          /* Smooth scrolling */
          html {
            scroll-behavior: smooth;
          }
          
          /* Article content styling */
          .article-content {
            line-height: 1.8;
            color: #374151;
          }
          .article-content p {
            margin-bottom: 1.5rem;
            font-size: 1.125rem;
            line-height: 1.8;
          }
          .article-content h2 {
            font-size: 1.875rem;
            font-weight: 700;
            margin: 3rem 0 1.5rem 0;
            color: #111827;
            text-transform: uppercase;
            letter-spacing: -0.025em;
          }
          .article-content h3 {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 2rem 0 1rem 0;
            color: #111827;
          }
          .article-content ul, .article-content ol {
            margin: 1.5rem 0;
            padding-left: 2rem;
          }
          .article-content li {
            margin-bottom: 0.75rem;
            font-size: 1.125rem;
            line-height: 1.8;
          }
          .article-content blockquote {
            border-left: 4px solid #000;
            padding-left: 1.5rem;
            margin: 2rem 0;
            font-style: italic;
            font-size: 1.25rem;
            color: #4B5563;
          }
          .article-content strong {
            font-weight: 700;
            color: #111827;
          }
          .article-content em {
            font-style: italic;
          }
        `}</style>
      </Head>

      <div className="bg-white text-black">
        {/* Header */}
        <header className="fixed top-8 left-0 right-0 z-50 transition-all duration-300">
          <div className="max-w-7xl mx-auto px-6">
            <div className="bg-white/95 backdrop-blur-sm rounded-full shadow-lg px-8 py-3 flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center">
                <Link href="/" className="flex items-center space-x-3">
                  <img 
                    src="/Logo BW.png?v=3" 
                    alt="FNE" 
                    className="h-12 w-auto py-1" 
                  />
                </Link>
              </div>
              
              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center space-x-10">
                <Link href="/#pasantias" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  PASANTÍAS
                </Link>
                <Link href="/#aula-generativa" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  AULA GENERATIVA
                </Link>
                <Link href="/noticias" className="text-base font-medium text-black font-semibold">
                  NOTICIAS
                </Link>
                <Link href="/#equipo" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  EQUIPO
                </Link>
                <Link href="/#contacto" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  CONTACTO
                </Link>
              </nav>
              
              {/* Login Button */}
              <div className="hidden lg:flex items-center space-x-4">
                <Link href="/login" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors border border-gray-300 rounded-full px-4 py-2">
                  PLATAFORMA DE CRECIMIENTO
                </Link>
              </div>
              
              {/* Mobile Menu Button */}
              <button className="lg:hidden p-2 text-gray-800">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Article Content */}
        <main className="pt-32">
          {/* Breadcrumb */}
          <section className="py-8 bg-gray-50">
            <div className="max-w-6xl mx-auto px-6">
              <nav className="flex items-center space-x-2 text-sm text-gray-600">
                <Link href="/" className="hover:text-black transition-colors">
                  Inicio
                </Link>
                <span>/</span>
                <Link href="/noticias" className="hover:text-black transition-colors">
                  Noticias
                </Link>
                <span>/</span>
                <span className="text-black truncate">{article.title}</span>
              </nav>
            </div>
          </section>

          {/* Article Content */}
          <section className="py-12">
            <div className="max-w-4xl mx-auto px-6">
              {/* Article Header */}
              <div className="mb-8">
                <div className="inline-block bg-black text-white px-4 py-2 rounded-full text-sm font-medium uppercase tracking-wide mb-6">
                  Noticia FNE
                </div>
                
                <h1 className="text-3xl lg:text-4xl font-black uppercase mb-6 leading-tight">
                  {article.title}
                </h1>
                
                <div className="flex items-center text-gray-600 mb-8">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span className="mr-6">{formatDate(article.created_at)}</span>
                  {article.author && (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                      </svg>
                      <span>
                        {`${article.author.first_name || ''} ${article.author.last_name || ''}`.trim() || 'Equipo FNE'}
                      </span>
                    </>
                  )}
                </div>

                {/* Featured Image */}
                {article.featured_image && (
                  <img
                    src={article.featured_image}
                    alt={article.title}
                    className="w-full h-64 lg:h-80 object-cover rounded-lg shadow-lg mb-8"
                  />
                )}
              </div>

              {/* Article Body */}
              <div 
                className="article-content"
                dangerouslySetInnerHTML={{ __html: article.content_html }}
              />
            </div>
          </section>

          {/* Back to News */}
          <section className="py-16">
            <div className="max-w-6xl mx-auto px-6">
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <h2 className="text-3xl font-black uppercase mb-6">¿Te gustó este artículo?</h2>
                <p className="text-lg text-gray-600 mb-8">
                  Descubre más historias de transformación educativa y las últimas novedades de la Fundación Nueva Educación.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/noticias" className="inline-flex items-center underline text-lg hover:text-gray-600 transition-colors">
                    <svg className="mr-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18"></path>
                    </svg>
                    <span>Ver todas las noticias</span>
                  </Link>
                  <Link href="/#contacto" className="inline-flex items-center border border-gray-300 rounded-full px-8 py-4 text-base font-medium hover:bg-gray-100 transition-all duration-300">
                    Contactar con FNE
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>


        <Footer />
      </div>
    </>
  );
}