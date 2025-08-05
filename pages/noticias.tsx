import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Footer from '../components/Footer';

interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  featured_image?: string;
  is_published: boolean;
  created_at: string;
  author?: {
    first_name?: string;
    last_name?: string;
  };
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 9;

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async (loadMore = false) => {
    try {
      setError(null);
      console.log('[News Page] Starting to fetch articles...');
      console.log('[News Page] Current loading state:', loading);
      console.log('[News Page] Timestamp:', new Date().toISOString());
      
      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[News Page] Fetch timeout - aborting request');
        controller.abort();
      }, 10000); // 10 second timeout
      
      const response = await fetch('/api/news', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('[News Page] Response received - status:', response.status);
      console.log('[News Page] Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[News Page] Response not ok:', response.status, errorText);
        throw new Error(`Error loading news: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('[News Page] JSON data parsed successfully');
      console.log('[News Page] Data type:', typeof data);
      console.log('[News Page] Is array:', Array.isArray(data));
      console.log('[News Page] Has articles property:', !!data.articles);
      
      // Handle new API response format {articles: [], total: number}
      const articles = data.articles || data; // Support both old and new formats
      console.log('[News Page] Articles extracted:', Array.isArray(articles) ? articles.length : 'NOT ARRAY');
      
      if (!Array.isArray(articles)) {
        console.error('[News Page] Articles is not an array:', articles);
        throw new Error('Invalid response format - articles is not an array');
      }
      
      console.log('[News Page] Raw articles count:', articles.length);
      
      // Filter only published articles
      const publishedArticles = articles.filter((article: NewsArticle) => article.is_published);
      console.log('[News Page] Published articles count:', publishedArticles.length);
      
      if (publishedArticles.length > 0) {
        console.log('[News Page] First article title:', publishedArticles[0].title);
        console.log('[News Page] First article published:', publishedArticles[0].is_published);
      }
      
      console.log('[News Page] About to set articles state...');
      setArticles(publishedArticles);
      console.log('[News Page] Articles state set successfully');
      
      setHasMore(false); // For now, load all articles at once
      console.log('[News Page] Fetch completed successfully');
      
    } catch (error) {
      console.error('[News Page] Error fetching articles:', error);
      console.error('[News Page] Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      if (error instanceof Error && error.name === 'AbortError') {
        setError('La solicitud tardó demasiado en responder. Por favor, intenta nuevamente.');
      } else {
        setError(error instanceof Error ? error.message : 'Error al cargar las noticias');
      }
      setArticles([]);
    } finally {
      console.log('[News Page] Setting loading to false...');
      setLoading(false);
      console.log('[News Page] Loading state updated to false');
    }
  };

  const loadMore = () => {
    fetchArticles(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getExcerpt = (html: string, length = 150) => {
    // Handle TipTap content better - remove HTML tags and clean up text
    let text = html.replace(/<[^>]*>/g, '');
    
    // Remove extra whitespace and newlines
    text = text.replace(/\s+/g, ' ').trim();
    
    // If the text is still gibberish or very short, provide a fallback
    if (!text || text.length < 10 || /^[a-z]{20,}$/i.test(text)) {
      // Different fallbacks based on length requested
      if (length <= 80) {
        return 'Innovación educativa y transformación.';
      } else {
        return 'Una nueva publicación de la Fundación Nueva Educación sobre innovación educativa y transformación pedagógica.';
      }
    }
    
    return text.length > length ? text.substring(0, length) + '...' : text;
  };

  return (
    <>
      <Head>
        <title>Noticias - Fundación Nueva Educación</title>
        <meta name="description" content="Mantente informado sobre las últimas actividades y eventos de la Fundación Nueva Educación" />
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
          
          /* Header backdrop blur */
          .header-blur {
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }
          
          /* Text clamping for card previews */
          .line-clamp-2 {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .line-clamp-3 {
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
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

        {/* Hero Section */}
        <section className="relative h-screen min-h-[600px] pt-24">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1920&h=1080&fit=crop')`,
            }}
          ></div>
          
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent"></div>
          
          <div className="relative z-10 h-full flex items-center">
            <div className="max-w-[1040px] mx-auto px-6">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black uppercase mb-6 text-white">
                NOTICIAS Y<br />NOVEDADES
              </h1>
              <p className="text-lg md:text-xl max-w-[600px] mb-6 text-white/90 leading-relaxed">
                Mantente informado sobre las últimas actividades, eventos y transformaciones que estamos impulsando en el mundo de la educación.
              </p>
              <p className="text-sm md:text-base max-w-[480px] mb-8 text-white/80">
                Historias de cambio, innovación pedagógica y comunidades educativas en crecimiento
              </p>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <main>
          {loading ? (
            <section className="py-24">
              <div className="max-w-[1040px] mx-auto px-6">
                <div className="text-center py-16">
                  <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-black"></div>
                  <p className="mt-6 text-xl text-gray-600">Cargando noticias...</p>
                  <div className="mt-8 p-4 bg-gray-100 rounded-lg text-left text-sm">
                    <p className="font-bold mb-2">Debug Info:</p>
                    <p>• Page loaded at: {new Date().toISOString()}</p>
                    <p>• Loading state: {loading ? 'true' : 'false'}</p>
                    <p>• Articles count: {articles.length}</p>
                    <p>• Error state: {error || 'none'}</p>
                    <p className="mt-2 text-xs text-gray-500">
                      If this shows for more than 10 seconds, check browser console (F12) for errors.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : articles.length === 0 ? (
            <section className="py-24">
              <div className="max-w-[1040px] mx-auto px-6">
                <div className="bg-white rounded-lg shadow-lg p-16 text-center">
                  {error ? (
                    <>
                      <h2 className="text-3xl font-black uppercase mb-6 text-red-600">Error al Cargar Noticias</h2>
                      <p className="text-lg text-gray-600 mb-4">
                        Hubo un problema al cargar las noticias: {error}
                      </p>
                      <p className="text-base text-gray-500 mb-8">
                        Por favor, verifica tu conexión a internet e intenta nuevamente.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button 
                          onClick={() => {
                            setLoading(true);
                            fetchArticles();
                          }}
                          className="inline-flex items-center bg-black text-white rounded-full px-8 py-4 text-base font-medium hover:bg-gray-800 transition-all duration-300"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                          </svg>
                          Reintentar
                        </button>
                        <Link href="/" className="inline-flex items-center border border-gray-300 rounded-full px-8 py-4 text-base font-medium hover:bg-gray-100 transition-all duration-300">
                          Volver al Inicio
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="text-3xl font-black uppercase mb-6">Sin Noticias Disponibles</h2>
                      <p className="text-lg text-gray-600 mb-8">
                        No hay noticias publicadas en este momento. ¡Vuelve pronto para ver las últimas novedades!
                      </p>
                      <Link href="/" className="inline-flex items-center border border-gray-300 rounded-full px-8 py-4 text-base font-medium hover:bg-gray-100 transition-all duration-300">
                        Volver al Inicio
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <>
              {/* Featured Article Section */}
              {articles[0] && (
                <section className="py-24">
                  <div className="max-w-[1040px] mx-auto px-6">
                    <div className="mb-8">
                      <div className="inline-block bg-black text-white px-4 py-2 rounded-full text-sm font-medium uppercase tracking-wide mb-4">
                        Destacado
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                      <div className="lg:flex">
                        {articles[0].featured_image && (
                          <div className="lg:w-[55%]">
                            <img
                              src={articles[0].featured_image}
                              alt={articles[0].title}
                              className="w-full h-64 lg:h-[500px] object-cover"
                            />
                          </div>
                        )}
                        <div className={`p-12 ${articles[0].featured_image ? 'lg:w-[45%]' : 'w-full'}`}>
                          <Link href={`/noticias/${articles[0].slug}`}>
                            <h2 className="text-3xl lg:text-4xl font-black uppercase mb-6 hover:text-gray-600 transition-colors cursor-pointer">
                              {articles[0].title}
                            </h2>
                          </Link>
                          
                          <div className="flex items-center text-sm text-gray-600 mb-6">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                            <span className="mr-6">{formatDate(articles[0].created_at)}</span>
                            {articles[0].author && (
                              <>
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                                <span>
                                  {`${articles[0].author.first_name || ''} ${articles[0].author.last_name || ''}`.trim() || 'Equipo FNE'}
                                </span>
                              </>
                            )}
                          </div>
                          
                          <p className="text-base leading-relaxed text-gray-700 mb-8">
                            {getExcerpt(articles[0].content_html, 250)}
                          </p>
                          
                          <Link href={`/noticias/${articles[0].slug}`} className="inline-flex items-center underline text-lg hover:text-gray-600 transition-colors">
                            <span>Leer artículo completo</span>
                            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                            </svg>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Articles Grid Section */}
              {articles.length > 1 && (
                <section className="py-24 bg-[#F5F5F5]">
                  <div className="max-w-[1040px] mx-auto px-6">
                    <div className="mb-12">
                      <h2 className="text-4xl font-black uppercase mb-6">Más Noticias</h2>
                      <p className="text-lg leading-relaxed max-w-2xl">
                        Descubre todas las historias, eventos y transformaciones que estamos impulsando en el mundo educativo.
                      </p>
                    </div>
                    
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                      {articles.slice(1).map((article) => (
                        <article key={article.id} className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300 flex flex-col h-full">
                          {article.featured_image && (
                            <Link href={`/noticias/${article.slug}`}>
                              <img
                                src={article.featured_image}
                                alt={article.title}
                                className="w-full h-48 object-cover hover:scale-105 transition-transform duration-300"
                              />
                            </Link>
                          )}
                          <div className="p-6 flex flex-col flex-1">
                            <Link href={`/noticias/${article.slug}`}>
                              <h3 className="text-xl font-bold text-gray-900 hover:text-gray-600 transition-colors mb-3 line-clamp-2">
                                {article.title}
                              </h3>
                            </Link>
                            
                            <div className="flex items-center text-sm text-gray-600 mb-4">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                              </svg>
                              <span>{formatDate(article.created_at)}</span>
                            </div>
                            
                            <div className="text-gray-700 text-sm mb-6 overflow-hidden h-10" style={{
                              wordWrap: 'break-word',
                              wordBreak: 'break-all',
                              overflowWrap: 'break-word',
                              hyphens: 'auto'
                            }}>
                              {getExcerpt(article.content_html, 30)}
                            </div>
                            
                            <Link href={`/noticias/${article.slug}`} className="inline-flex items-center underline text-base hover:text-gray-600 transition-colors mt-auto">
                              <span>Leer más</span>
                              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                              </svg>
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        <Footer />
      </div>
    </>
  );
}