import React from 'react';
import Link from 'next/link';

interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  featured_image?: string;
  is_published: boolean;
  created_at: string;
  display_date?: string;
  author?: {
    first_name?: string;
    last_name?: string;
  };
}

interface NewsSliderProps {
  articles: NewsArticle[];
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} de ${month} de ${year}`;
};

const getExcerpt = (html: string, length = 80) => {
  let text = html.replace(/<[^>]*>/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  
  if (!text || text.length < 10 || /^[a-z]{20,}$/i.test(text)) {
    return 'Una nueva publicación de la Fundación Nueva Educación.';
  }
  
  return text.length > length ? text.substring(0, length) + '...' : text;
};

export default function NewsSlider({ articles }: NewsSliderProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);
  
  // Handle mouse down on slider
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = true;
    startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;
    
    // Change cursor and prevent text selection
    scrollContainerRef.current.style.cursor = 'grabbing';
    scrollContainerRef.current.style.userSelect = 'none';
  };
  
  // Handle mouse move while dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollContainerRef.current) return;
    
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Multiply for faster scrolling
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };
  
  // Handle mouse up
  const handleMouseUp = () => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = '';
  };
  
  // Handle mouse leave
  const handleMouseLeave = () => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = '';
  };
  
  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = true;
    startX.current = e.touches[0].pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !scrollContainerRef.current) return;
    
    const x = e.touches[0].pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };
  
  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  // Animation on mount
  React.useEffect(() => {
    const newsCards = document.querySelectorAll('.news-card');
    newsCards.forEach((card, index) => {
      setTimeout(() => {
        card.classList.remove('opacity-0');
        card.classList.add('opacity-100');
      }, index * 100);
    });
  }, [articles]);

  if (articles.length === 0) return null;

  return (
    <section className="py-24 bg-[#F5F5F5] overflow-hidden">
      <div className="max-w-full px-6">
        <div className="max-w-[1040px] mx-auto mb-12">
          <h2 className="text-4xl font-black uppercase mb-6">Más Noticias</h2>
          <p className="text-lg leading-relaxed max-w-2xl">
            Descubre todas las historias, eventos y transformaciones que estamos impulsando en el mundo educativo.
          </p>
        </div>
        
        {/* Gradient overlays for visual depth */}
        <div className="relative">
          {articles.length > 3 && (
            <>
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#F5F5F5] to-transparent z-10 pointer-events-none"></div>
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#F5F5F5] to-transparent z-10 pointer-events-none"></div>
            </>
          )}
          
          {/* Scrollable Container */}
          <div 
            className={`${articles.length <= 3 ? '' : 'overflow-x-auto'} pb-6 news-slider-container scrollbar-thin`}
            ref={scrollContainerRef}
            onMouseDown={articles.length > 3 ? handleMouseDown : undefined}
            onMouseMove={articles.length > 3 ? handleMouseMove : undefined}
            onMouseUp={articles.length > 3 ? handleMouseUp : undefined}
            onMouseLeave={articles.length > 3 ? handleMouseLeave : undefined}
            onTouchStart={articles.length > 3 ? handleTouchStart : undefined}
            onTouchMove={articles.length > 3 ? handleTouchMove : undefined}
            onTouchEnd={articles.length > 3 ? handleTouchEnd : undefined}
            style={{ cursor: articles.length > 3 ? 'grab' : 'default' }}
          >
            <div className={`flex space-x-6 ${articles.length <= 3 ? 'justify-center mx-auto' : 'px-6'}`} style={{ width: articles.length <= 3 ? 'auto' : 'max-content' }}>
              {articles.map((article, index) => (
                <article 
                  key={article.id} 
                  className="news-card opacity-0 bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 flex flex-col transform hover:scale-105"
                  style={{ 
                    minWidth: '320px',
                    maxWidth: '320px',
                    transition: 'all 0.5s ease-out'
                  }}
                >
                  {article.featured_image ? (
                    <Link href={`/noticias/${article.slug}`}>
                      <div className="relative h-48 overflow-hidden">
                        <img
                          src={article.featured_image}
                          alt={article.title}
                          className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                          draggable="false"
                        />
                        {/* Date overlay on image */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                          <span className="text-white text-xs font-semibold">
                            {formatDate(article.display_date || article.created_at)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                      <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2"></path>
                      </svg>
                    </div>
                  )}
                  
                  <div className="p-6 flex flex-col flex-1">
                    <Link href={`/noticias/${article.slug}`}>
                      <h3 className="text-lg font-bold text-gray-900 hover:text-black transition-colors mb-3 line-clamp-2">
                        {article.title}
                      </h3>
                    </Link>
                    
                    {!article.featured_image && (
                      <div className="flex items-center text-xs text-gray-500 mb-3">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span>{formatDate(article.display_date || article.created_at)}</span>
                      </div>
                    )}
                    
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-grow">
                      {getExcerpt(article.content_html, 100)}
                    </p>
                    
                    <Link 
                      href={`/noticias/${article.slug}`} 
                      className="inline-flex items-center text-sm font-semibold text-black hover:text-gray-600 transition-colors group"
                    >
                      <span>Leer más</span>
                      <svg className="ml-1 w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                      </svg>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
          
          {/* Scroll Indicator */}
          {articles.length > 3 && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-8 h-8 text-gray-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          )}
        </div>
      </div>
      
      {/* Custom styles for scrollbar */}
      <style jsx>{`
        .news-slider-container::-webkit-scrollbar {
          height: 6px;
        }
        
        .news-slider-container::-webkit-scrollbar-track {
          background: #e5e7eb;
          border-radius: 3px;
        }
        
        .news-slider-container::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 3px;
        }
        
        .news-slider-container::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
        
        .news-slider-container {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        
        .news-card {
          -webkit-user-drag: none;
          -khtml-user-drag: none;
          -moz-user-drag: none;
          -o-user-drag: none;
          user-drag: none;
        }
      `}</style>
    </section>
  );
}