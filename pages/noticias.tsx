import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import SiteLayout from '../components/site/SiteLayout';
import NewsCard from '../components/site/NewsCard';
import { NewsArticle, PublicEvent, articleDate, excerpt, fetchNews } from '../components/site/news';
import { formatEventDate, parseLocalDate } from '../utils/dateUtils';

// Supabase client for the real-time subscription to the events table.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SHORT_MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const PAST_EVENTS_STEP = 6;

/** "23–27" within a month, "30–2" across two, or the single day. */
function eventDays(event: PublicEvent): string {
  const start = parseLocalDate(event.date_start);
  if (!event.date_end || event.date_end === event.date_start) return String(start.getDate());
  return `${start.getDate()}–${parseLocalDate(event.date_end).getDate()}`;
}

function eventMonth(event: PublicEvent): string {
  const start = parseLocalDate(event.date_start);
  return `${SHORT_MONTHS[start.getMonth()]} ${start.getFullYear()}`;
}

function eventRange(event: PublicEvent): string {
  const start = formatEventDate(event.date_start);
  if (!event.date_end || event.date_end === event.date_start) return start;
  return `${start} – ${formatEventDate(event.date_end)}`;
}

/** An event's description: long ones are clamped to a few lines until asked for. */
function EventText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <>
      <p className={long && !open ? 'corta' : undefined}>{text}</p>
      {long && (
        <button type="button" className="mas-t" onClick={() => setOpen((value) => !value)} data-testid="evento-leer-mas">
          {open ? 'Leer menos' : 'Leer más'}
        </button>
      )}
    </>
  );
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [events, setEvents] = useState<{ pastEvents: PublicEvent[]; futureEvents: PublicEvent[] }>({
    pastEvents: [],
    futureEvents: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pastShown, setPastShown] = useState(PAST_EVENTS_STEP);

  const fetchArticles = async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      setError(null);
      setArticles(await fetchNews(controller.signal));
    } catch (caught) {
      console.error('[News Page] Error fetching articles:', caught);
      if (caught instanceof Error && caught.name === 'AbortError') {
        setError('La solicitud tardó demasiado en responder. Por favor, intenta nuevamente.');
      } else {
        setError('No pudimos cargar las noticias. Por favor, intenta nuevamente.');
      }
      setArticles([]);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/public/events');
      if (!response.ok) throw new Error('Error loading events');
      const data = await response.json();
      setEvents({ pastEvents: data.pastEvents || [], futureEvents: data.futureEvents || [] });
    } catch (caught) {
      // Events are optional on this page: without them their sections stay out.
      console.error('Error fetching events:', caught);
    }
  };

  useEffect(() => {
    fetchArticles();
    fetchEvents();

    // Refetch the events whenever the events table changes.
    const subscription = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchEvents())
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const [lead, ...rest] = articles;
  const upcoming = [...events.futureEvents].sort((a, b) => a.date_start.localeCompare(b.date_start));

  return (
    <SiteLayout
      active="noticias"
      title="Noticias y eventos · Fundación Nueva Educación"
      description="Mantente informado sobre las últimas actividades y eventos de la Fundación Nueva Educación"
    >
      <section className="phero">
        <div className="iso" aria-hidden="true">
          <i className="mark line spin" style={{ background: '#fff' }} />
        </div>
        <i className="art" aria-hidden="true" style={{ ['--m' as string]: 'url(/sitio/linea-collaborative.png)' }} />
        <div className="wrap">
          <div className="eyebrow rv">Noticias y eventos</div>
          <h1 className="rv">
            <span className="l">Lo que está pasando</span> en la Nueva Educación
          </h1>
          <p className="lead rv">
            Mantente informado sobre las últimas actividades, eventos y transformaciones que estamos impulsando
            en el mundo de la educación. Historias de cambio, innovación pedagógica y el impacto de nuestros
            programas en comunidades educativas.
          </p>
        </div>
      </section>

      <section className="diario">
        <div className="wrap">
          {upcoming.length > 0 && (
            <>
              <h2 className="sub-t" data-testid="eventos-proximos">Próximos eventos</h2>
              <div className="agenda">
                {upcoming.map((event, index) => (
                  <article className="cita-e rv" key={event.id} style={{ ['--d' as string]: index }}>
                    <div className="dia">
                      <b>{eventDays(event)}</b>
                      <span>{eventMonth(event)}</span>
                    </div>
                    <div>
                      <h3>{event.title}</h3>
                      <p className="cu">
                        {event.location}
                        {event.time ? ` · ${event.time}` : ''}
                      </p>
                      {event.description && <EventText text={event.description} />}
                      {event.link_url && (
                        <a href={event.link_url} target="_blank" rel="noopener noreferrer">
                          {event.link_display || 'Más información'} →
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          <h2 className="sub-t" data-testid="noticias-titulo">Noticias</h2>
          {loading ? (
            <div className="estado" role="status">
              <i className="mark line gira" aria-hidden="true" />
              <p>Cargando noticias…</p>
            </div>
          ) : error ? (
            <div className="estado" role="alert">
              <i className="mark line" aria-hidden="true" />
              <p>{error}</p>
              <button
                type="button"
                className="btn marino"
                onClick={() => {
                  setLoading(true);
                  fetchArticles();
                }}
                data-testid="noticias-reintentar"
              >
                Intentar nuevamente
              </button>
            </div>
          ) : articles.length === 0 ? (
            <div className="estado">
              <i className="mark line" aria-hidden="true" />
              <p>Pronto publicaremos nuestras primeras noticias.</p>
            </div>
          ) : (
            <>
              <Link className="portada rv" href={`/noticias/${lead.slug}`} data-testid={`noticia-${lead.slug}`}>
                <figure>
                  {lead.featured_image && <img src={lead.featured_image} alt={lead.title} decoding="async" />}
                </figure>
                <div className="tx">
                  <i className="mark line spin" aria-hidden="true" />
                  <time>{articleDate(lead)}</time>
                  <h2>{lead.title}</h2>
                  <p>{excerpt(lead.content_html, 220)}</p>
                  <span className="txtlink" style={{ width: 'max-content' }}>
                    Leer la noticia <span>→</span>
                  </span>
                </div>
              </Link>
              <div className="rejilla">
                {rest.map((article, index) => (
                  <NewsCard key={article.id} article={article} order={index % 3} />
                ))}
              </div>
            </>
          )}

          {events.pastEvents.length > 0 && (
            <>
              <h2 className="sub-t" data-testid="eventos-anteriores">Eventos anteriores</h2>
              <ol className="linea-t">
                {events.pastEvents.slice(0, pastShown).map((event) => (
                  <li className="rv" key={event.id}>
                    <span className="fecha-k">
                      {eventRange(event)} · {event.location}
                    </span>
                    <h3>{event.title}</h3>
                    {event.description && <EventText text={event.description} />}
                    {event.link_url && (
                      <a href={event.link_url} target="_blank" rel="noopener noreferrer">
                        {event.link_display || 'Más información'} →
                      </a>
                    )}
                  </li>
                ))}
              </ol>
              {events.pastEvents.length > pastShown && (
                <button
                  type="button"
                  className="btn ghost tinta"
                  onClick={() => setPastShown((count) => count + PAST_EVENTS_STEP)}
                  data-testid="eventos-ver-mas"
                >
                  Ver más eventos
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
