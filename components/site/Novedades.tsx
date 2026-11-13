import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import NewsCard from './NewsCard';
import { NewsArticle, fetchNews } from './news';

/**
 * The three latest news items on the homepage. Loaded in the browser; with no
 * news (or no connection to them) the whole band stays out of the page.
 */
export default function Novedades() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchNews(controller.signal)
      .then((all) => setArticles(all.slice(0, 3)))
      .catch(() => {
        /* The band is optional: stay hidden. */
      });
    return () => controller.abort();
  }, []);

  if (articles.length === 0) return null;

  return (
    <section className="novedades" id="noticias">
      <div className="wrap">
        <div className="top">
          <div>
            <div className="eyebrow rv">Noticias</div>
            <h2 className="rv">
              <span className="l">Lo que está</span> pasando
            </h2>
          </div>
          <Link className="txtlink rv" href="/noticias" data-testid="novedades-todas" style={{ color: 'var(--azul)' }}>
            Todas las noticias y eventos <span>→</span>
          </Link>
        </div>
        <div className="notas">
          {articles.map((article, index) => (
            <NewsCard key={article.id} article={article} order={index} withExcerpt={index === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
