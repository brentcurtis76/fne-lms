import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import SiteLayout from '../../components/site/SiteLayout';
import NewsCard from '../../components/site/NewsCard';
import ArticleContent from '../../components/ArticleContent';
import { NewsArticle, articleDate, excerpt, fetchNews } from '../../components/site/news';

export default function ArticlePage() {
  const router = useRouter();
  const { slug } = router.query;
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [others, setOthers] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchNews()
      .then((articles) => {
        if (cancelled) return;
        const found = articles.find((candidate) => candidate.slug === slug);
        if (!found) {
          setArticle(null);
          setError('Artículo no encontrado');
          return;
        }
        setArticle(found);
        setOthers(articles.filter((candidate) => candidate.slug !== slug).slice(0, 3));
      })
      .catch((caught) => {
        if (cancelled) return;
        console.error('Error fetching article:', caught);
        setError('Error al cargar el artículo');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* Clipboard not available: the address bar still has the link. */
    }
  };

  if (loading || error || !article) {
    return (
      <SiteLayout
        active="noticias"
        title={`${loading ? 'Cargando artículo' : 'Artículo no encontrado'} · Fundación Nueva Educación`}
        description="Noticias de la Fundación Nueva Educación"
      >
        <section className="phero art-h" style={{ minHeight: '100svh', justifyContent: 'center' }}>
          <div className="iso" aria-hidden="true">
            <i className="mark line spin" style={{ background: '#fff' }} />
          </div>
          <div className="wrap">
            {loading ? (
              <p className="meta" role="status">Cargando artículo…</p>
            ) : (
              <>
                <h1>{error || 'Artículo no encontrado'}</h1>
                <p className="lead">El artículo que buscas no existe o ya no está disponible.</p>
                <Link className="volver" href="/noticias" data-testid="articulo-volver">
                  ← Volver a noticias
                </Link>
              </>
            )}
          </div>
        </section>
      </SiteLayout>
    );
  }

  const author = article.author
    ? `${article.author.first_name || ''} ${article.author.last_name || ''}`.trim() || 'Equipo FNE'
    : '';

  return (
    <SiteLayout
      active="noticias"
      title={`${article.title} · Fundación Nueva Educación`}
      description={excerpt(article.content_html, 160)}
      image={article.featured_image}
    >
      <section className="phero art-h">
        <div className="iso" aria-hidden="true">
          <i className="mark line spin" style={{ background: '#fff' }} />
        </div>
        <div className="wrap">
          <Link className="volver" href="/noticias" data-testid="articulo-volver">
            ← Noticias
          </Link>
          <h1>{article.title}</h1>
          <p className="meta">
            <b>{articleDate(article)}</b>
            {author && <span>Por {author}</span>}
          </p>
        </div>
      </section>

      <article className="articulo">
        {article.featured_image ? (
          <div className="lamina">
            <img src={article.featured_image} alt={article.title} decoding="async" />
          </div>
        ) : (
          <div style={{ height: 'clamp(40px,6vw,80px)' }} />
        )}
        <div className="cuerpo">
          <ArticleContent content={article.content_html} />
        </div>
        <div className="comparte">
          <Link className="volver" href="/noticias" style={{ color: 'var(--azul)' }} data-testid="articulo-todas">
            ← Ver todas las noticias
          </Link>
          <div>
            <button type="button" onClick={copyLink} data-testid="articulo-copiar">
              {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
            <Link href="/#contacto" data-testid="articulo-contacto">
              Contactar con FNE
            </Link>
          </div>
        </div>
      </article>

      {others.length > 0 && (
        <section className="mas-n">
          <div className="wrap">
            <h2 className="rv">
              <span className="l">Más historias</span> de transformación
            </h2>
            <div className="rejilla">
              {others.map((other, index) => (
                <NewsCard key={other.id} article={other} order={index} />
              ))}
            </div>
          </div>
        </section>
      )}
    </SiteLayout>
  );
}
