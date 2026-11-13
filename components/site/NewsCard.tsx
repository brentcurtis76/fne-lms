import React from 'react';
import Link from 'next/link';
import { NewsArticle, articleDate, excerpt } from './news';

interface NewsCardProps {
  article: NewsArticle;
  /** Stagger position for the scroll reveal. */
  order?: number;
  withExcerpt?: boolean;
}

export default function NewsCard({ article, order = 0, withExcerpt = true }: NewsCardProps) {
  const summary = withExcerpt ? excerpt(article.content_html, 130) : '';
  return (
    <Link
      className="nota-c rv"
      href={`/noticias/${article.slug}`}
      style={{ ['--d' as string]: order }}
      data-testid={`noticia-${article.slug}`}
    >
      <figure>
        {article.featured_image ? (
          <img src={article.featured_image} alt={article.title} loading="lazy" decoding="async" />
        ) : (
          <i className="mark line" />
        )}
      </figure>
      <div className="tx">
        <time>{articleDate(article)}</time>
        <h3>{article.title}</h3>
        {summary && <p>{summary}</p>}
        <span className="go">Leer →</span>
      </div>
    </Link>
  );
}
