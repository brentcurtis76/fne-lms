/** Shapes and small helpers shared by the public news pages. */

export interface NewsArticle {
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

export interface PublicEvent {
  id: string;
  title: string;
  location: string;
  date_start: string;
  date_end?: string;
  time?: string;
  description?: string;
  link_url?: string;
  link_display?: string;
  is_published: boolean;
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "12 de noviembre de 2026", read in UTC so server and browser agree. */
export function formatNewsDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

export function articleDate(article: NewsArticle): string {
  return formatNewsDate(article.display_date || article.created_at);
}

/** Plain-text excerpt of an article's rich content. */
export function excerpt(html: string, length = 150): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length < 10) return '';
  return text.length > length ? `${text.substring(0, length).trimEnd()}…` : text;
}

/** The public news endpoint answers either an array or `{ articles }`. */
export async function fetchNews(signal?: AbortSignal): Promise<NewsArticle[]> {
  const response = await fetch('/api/news', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Error loading news: ${response.status}`);
  const data = await response.json();
  const articles = Array.isArray(data) ? data : data.articles;
  if (!Array.isArray(articles)) throw new Error('Invalid response format - articles is not an array');
  return articles;
}
