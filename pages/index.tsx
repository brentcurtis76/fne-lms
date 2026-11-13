import React, { useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { COHORT_HEADLINE, COHORT_PROGRAMS } from '../lib/pasantias/cohort-public';
import SiteLayout from '../components/site/SiteLayout';
import RedAliada from '../components/site/RedAliada';
import Sociograma from '../components/site/Sociograma';
import ViasEje from '../components/site/ViasEje';
import Puertas from '../components/site/Puertas';
import MapaChile from '../components/site/MapaChile';
import FlipbookDialog from '../components/site/FlipbookDialog';

// Below the fold and fed by the news API: loaded in the browser only.
const Novedades = dynamic(() => import('../components/site/Novedades'), { ssr: false });

const DIRECTIVOS_FLIPBOOK = 'https://heyzine.com/flip-book/d87d80f309.html';
const DIRECTIVOS_FLIPBOOK_TAB = 'https://heyzine.com/flip-book/92bf9eb5ee.html';

const HERO_WORDS: Array<Array<{ text: string; gold?: boolean }>> = [
  [{ text: 'La' }, { text: 'escuela' }, { text: 'se' }, { text: 'transforma' }],
  [{ text: 'desde' }, { text: 'sus' }, { text: 'vínculos.', gold: true }],
];

export default function HomePage() {
  const [showDirectivesFlipbook, setShowDirectivesFlipbook] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitMessage, setSubmitMessage] = React.useState('');
  const [submitError, setSubmitError] = React.useState('');
  // When the contact form became usable, so /api/contact can tell a person
  // from a script that submits the instant the page loads.
  const contactFormReadyAt = React.useRef<number | null>(null);

  useEffect(() => {
    contactFormReadyAt.current = Date.now();
  }, []);

  const handleContactSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage('');
    setSubmitError('');

    const formData = new FormData(e.currentTarget);
    const contactData = {
      nombre: formData.get('nombre') as string,
      email: formData.get('email') as string,
      institucion: formData.get('institucion') as string,
      cargo: formData.get('cargo') as string,
      interes: formData.get('interes') as string,
      mensaje: formData.get('mensaje') as string,
      // Bot screening, both read by /api/contact (lib/formSpamGuard.ts).
      website: (formData.get('website') as string) || '',
      elapsedMs:
        contactFormReadyAt.current === null ? undefined : Date.now() - contactFormReadyAt.current,
    };

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactData),
      });

      const result = await response.json();

      if (response.ok) {
        setSubmitMessage(result.message || '¡Mensaje enviado exitosamente! Te responderemos pronto.');
        // Reset form
        (e.target as HTMLFormElement).reset();
      } else {
        setSubmitError(result.error || 'Error al enviar el mensaje. Por favor intenta nuevamente.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitError('Error de conexión. Por favor verifica tu conexión a internet e intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  let wordIndex = 0;

  return (
    <SiteLayout
      active="inicio"
      title="Fundación Nueva Educación · Educación relacional para transformar la escuela"
      description="Acompañamos a comunidades educativas en un cambio cultural profundo, desde la calidad de sus relaciones. Programas Inicia, Inspira, Evoluciona y Aula Generativa. ATE certificada por RPA Mineduc."
    >
      {/* ───────── hero ───────── */}
      <section className="hero" id="inicio">
        <video autoPlay muted loop playsInline poster="/sitio/hero-poster.jpg" src="/sitio/hero.mp4" />
        <div className="iso" aria-hidden="true">
          <i className="mark line spin" style={{ background: '#fff' }} />
        </div>
        <div className="hero-in">
          <div className="eyebrow fade" style={{ ['--i' as string]: 0 }}>
            Fundación Nueva Educación · ATE certificada por RPA Mineduc
          </div>
          <h1 aria-label="La escuela se transforma desde sus vínculos.">
            {HERO_WORDS.map((row, rowIndex) => (
              <span className="row" aria-hidden="true" key={rowIndex}>
                {row.map((word) => (
                  <span className="w" style={{ ['--i' as string]: wordIndex++ }} key={word.text}>
                    <span className={word.gold ? 'hl' : undefined}>{word.text}</span>
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <div className="mano tag fade" style={{ ['--i' as string]: 1 }}>
            educación relacional
          </div>
          <p className="lead fade" style={{ ['--i' as string]: 2 }}>
            Acompañamos a comunidades educativas en un cambio cultural profundo. Empieza donde empieza todo
            aprendizaje: en la calidad de las relaciones entre estudiantes, docentes, directivos y familias.
          </p>
          <div className="cta fade" style={{ ['--i' as string]: 3 }}>
            <Link className="btn mag" href="#contacto" data-testid="hero-cta-contacto">
              Conversemos tu escuela <span className="arr">→</span>
            </Link>
            <Link className="btn ghost" href="/programas" data-testid="hero-cta-programas">
              Ver los programas
            </Link>
          </div>
        </div>
        <div className="stats fade" style={{ ['--i' as string]: 4 }}>
          <div className="stat">
            <b data-n="33">33</b>
            <span>Colegios en programas de transformación</span>
          </div>
          <div className="stat">
            <b data-n="13">13</b>
            <span>Ciudades de Chile, de Iquique a Osorno</span>
          </div>
          <div className="stat">
            <b data-n="400" data-pre="+">+400</b>
            <span>Pasantes internacionales en Barcelona</span>
          </div>
          <div className="stat">
            <b data-n="12">12</b>
            <span>Escuelas colaboradoras en Barcelona</span>
          </div>
        </div>
      </section>

      <RedAliada />

      {/* ───────── tesis ───────── */}
      <section className="tesis" id="relacional">
        <div className="wrap cols">
          <div className="copy">
            <div className="eyebrow rv">Por qué relacional</div>
            <h2 className="rv">
              <span className="l">Nadie aprende</span> <em>solo.</em>
            </h2>
            <p className="big rv">
              Se aprende con otros, de otros y para otros. Por eso una escuela no cambia de verdad cuando cambia
              sus horarios, sus muebles o su tecnología. Cambia cuando cambia la manera en que sus personas se
              relacionan.
            </p>
            <p className="rv">
              A eso lo llamamos Educación Relacional: poner la calidad de los vínculos en el centro del proyecto
              educativo y dejar que desde ahí se ordenen el aprendizaje, la evaluación, el liderazgo y la
              relación con las familias.
            </p>
            <ul className="lazos">
              <li className="rv" style={{ ['--d' as string]: 0 }}>
                <i className="mark" />
                <span>Entre <b>estudiantes</b>: pares que se cuidan y aprenden juntos</span>
              </li>
              <li className="rv" style={{ ['--d' as string]: 1 }}>
                <i className="mark" />
                <span>Entre <b>estudiantes y docentes</b>: confianza para atreverse</span>
              </li>
              <li className="rv" style={{ ['--d' as string]: 2 }}>
                <i className="mark" />
                <span>Entre <b>docentes</b>: equipos que crean en vez de trabajar a solas</span>
              </li>
              <li className="rv" style={{ ['--d' as string]: 3 }}>
                <i className="mark" />
                <span>Entre <b>la escuela y sus familias</b>: aliadas del proyecto educativo</span>
              </li>
            </ul>
          </div>
          <div className="fotos">
            <i className="mark line spin" />
            <figure className="a clip">
              <img
                src="/sitio/abrazo.jpg"
                alt="Cinco estudiantes abrazados en círculo, vistos desde arriba"
                data-img-par="1"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <figure className="b">
              <i className="art" style={{ ['--m' as string]: 'url(/sitio/linea-huddle.png)' }} />
            </figure>
            <div className="mano nota rv">en relación</div>
          </div>
        </div>
      </section>

      <Sociograma />

      {/* ───────── origen ───────── */}
      <section className="origen" id="origen">
        <div className="wrap cols">
          <figure className="clip">
            <img
              src="/aula-generativa-activity.jpg"
              alt="Estudiantes juegan al aire libre durante una actividad de Aula Generativa"
              loading="lazy"
              decoding="async"
              data-img-par="1"
            />
            <figcaption className="mano">el espíritu de Los Pellines</figcaption>
          </figure>
          <div>
            <div className="eyebrow rv">De dónde venimos</div>
            <h2 className="rv">
              <span className="l">Treinta años</span> cuidando vínculos
            </h2>
            <p className="rv">
              En Los Pellines nos hemos dedicado por más de 30 años al cuidado y fortalecimiento de la calidad de
              las relaciones. Hoy llevamos ese espíritu a la sala de clases con el Aula Generativa, una propuesta
              que pone en el centro el Aprendizaje con Sentido.
            </p>
            <div className="nums rv">
              <div>
                <b data-n="30" data-pre="+">+30</b>
                <span>años de experiencia</span>
              </div>
              <div>
                <b data-n="80000" data-pre="+">+80.000</b>
                <span>niños y niñas</span>
              </div>
            </div>
            <div className="celdas">
              <div className="rv" style={{ ['--d' as string]: 0 }}>
                <span className="k">Aula Generativa</span>
                <h3>Motivación compartida</h3>
                <p>Estudiantes y profesores altamente motivados trabajando juntos.</p>
              </div>
              <div className="rv" style={{ ['--d' as string]: 1 }}>
                <span className="k">Aula Generativa</span>
                <h3>Convivencia como motor</h3>
                <p>Las relaciones saludables impulsan el aprendizaje significativo.</p>
              </div>
              <div className="rv" style={{ ['--d' as string]: 2 }}>
                <span className="k">Aula Generativa</span>
                <h3>Identidad colectiva</h3>
                <p>Cultura de curso fortalecida, con una identidad positiva compartida.</p>
              </div>
              <div className="rv" style={{ ['--d' as string]: 3 }}>
                <span className="k">Aula Generativa</span>
                <h3>Aprendizaje cooperativo</h3>
                <p>Los estudiantes enseñan, explican y reflexionan entre pares.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ViasEje />

      <Puertas onOpenDirectivos={() => setShowDirectivesFlipbook(true)} />

      {/* ───────── pasantías ─────────
          The copy of this teaser is the ratified January contract's; only its look changed. */}
      <section className="bcn" id="pasantias">
        <i className="sky" aria-hidden="true" />
        <div className="wrap cols">
          <div>
            <div className="eyebrow rv">Programa Inspira</div>
            <h2 className="rv">
              <span className="l">Pasantías en</span> Barcelona
            </h2>
            <p className="lead rv">
              Transforma tu visión educativa con una experiencia única de innovación en el corazón de Europa
            </p>

            <div className="cohorte rv">
              <div className="sello">
                <p>CUPOS POR</p>
                <p>ORDEN DE RESERVA</p>
              </div>
              <h3>Próximas Expediciones</h3>
              <small>Próxima cohorte</small>
              <p className="fecha" data-testid="cohort-headline">{COHORT_HEADLINE}</p>
              <p className="prog-n" data-testid="cohort-programs">
                {COHORT_PROGRAMS.map((program) => program.name).join(' · ')}
              </p>
            </div>

            <div className="incluye">
              <h3 className="rv">¿Qué incluye la experiencia?</h3>
              <ol>
                <li className="rv">
                  <span>01</span>
                  <div>
                    <h4>Codocencia en Aulas</h4>
                    <p>Participa activamente en aulas de Nueva Educación como co-docente</p>
                  </div>
                </li>
                <li className="rv">
                  <span>02</span>
                  <div>
                    <h4>Visitas a Escuelas Innovadoras</h4>
                    <p>Conoce de primera mano las metodologías más vanguardistas de Europa</p>
                  </div>
                </li>
                <li className="rv">
                  <span>03</span>
                  <div>
                    <h4>Talleres Especializados</h4>
                    <p>Participa en workshops con expertos internacionales en educación</p>
                  </div>
                </li>
                <li className="rv">
                  <span>04</span>
                  <div>
                    <h4>Intercambio con las Escuelas</h4>
                    <p>Conversa con los equipos directivos, educadores y estudiantes de las escuelas que te reciben</p>
                  </div>
                </li>
                <li className="rv">
                  <span>05</span>
                  <div>
                    <h4>Bitácora de Aprendizajes</h4>
                    <p>Recibe bibliografía recomendada, una bitácora y un sistema de registro de tus aprendizajes al menos un mes antes del viaje</p>
                  </div>
                </li>
              </ol>
            </div>

            <div className="acc rv">
              <Link className="btn mag" href="/pasantias" data-testid="inspira-pasantias-cta">
                <span>Conoce las Pasantías en Barcelona</span>
              </Link>
            </div>
          </div>

          <div className="mosaico">
            <figure className="clip">
              <img src="/images/pasantias/pasantes-virolai.jpg" alt="Grupo de pasantes frente a la Escola Virolai, en Barcelona" loading="lazy" decoding="async" />
            </figure>
            <figure className="clip">
              <img src="/images/pasantias/educadores-biblioteca.jpg" alt="Educadoras chilenas en la biblioteca de una escuela de Barcelona" loading="lazy" decoding="async" />
            </figure>
            <figure className="clip">
              <img src="/sitio/bcn-microscopios.jpg" alt="Niños observan con microscopios en un aula de Barcelona" loading="lazy" decoding="async" />
            </figure>
            <figure className="clip">
              <img src="/images/pasantias/bcn-skyline.jpg" alt="Vista aérea de Barcelona" loading="lazy" decoding="async" />
            </figure>
            <figure className="clip">
              <img src="/sitio/bcn-ambientes.jpg" alt="Aula de aprendizaje con trabajo por ambientes" loading="lazy" decoding="async" />
            </figure>
          </div>
        </div>
      </section>

      <Novedades />

      <MapaChile />

      {/* ───────── contacto ───────── */}
      <section className="contacto" id="contacto">
        <i className="mark line deco spin" aria-hidden="true" />
        <div className="wrap cols">
          <div className="side">
            <div className="eyebrow rv">Contáctanos</div>
            <h2 className="rv">
              <span className="l">Empecemos por</span> una conversación.
            </h2>
            <p className="rv">
              ¿Listo para transformar tu institución educativa? Conversemos sobre cómo podemos acompañar tu
              proceso de transformación.
            </p>
            <div className="dir rv">
              <a href="mailto:info@nuevaeducacion.org">info@nuevaeducacion.org</a>
              <span>Santiago, Chile</span>
              <span>ATE certificada por RPA Mineduc</span>
            </div>
          </div>

          <div className="caja rv">
            <h3>Cuéntanos sobre tu proyecto</h3>

            {submitMessage && (
              <p className="aviso ok" role="status">
                <span>{submitMessage}</span>
              </p>
            )}
            {submitError && (
              <p className="aviso mal" role="alert">
                <span>{submitError}</span>
              </p>
            )}

            <form onSubmit={handleContactSubmit}>
              <div className="f">
                <label htmlFor="nombre">Nombre *</label>
                <input type="text" id="nombre" name="nombre" required placeholder="Tu nombre completo" autoComplete="name" />
              </div>
              <div className="f">
                <label htmlFor="email">Email *</label>
                <input type="email" id="email" name="email" required placeholder="tu@email.com" autoComplete="email" />
              </div>
              <div className="f">
                <label htmlFor="institucion">Institución *</label>
                <input type="text" id="institucion" name="institucion" required placeholder="Nombre de tu institución" autoComplete="organization" />
              </div>
              <div className="f">
                <label htmlFor="cargo">Cargo</label>
                <input type="text" id="cargo" name="cargo" placeholder="Tu cargo o función" autoComplete="organization-title" />
              </div>
              <div className="f w">
                <label htmlFor="interes">¿Qué te interesa? *</label>
                <select id="interes" name="interes" required defaultValue="">
                  <option value="">Selecciona una opción</option>
                  <option value="inspira">Inspira (Pasantía en Barcelona)</option>
                  <option value="inicia">Inicia</option>
                  <option value="evoluciona">Evoluciona</option>
                  <option value="aula-generativa">Aula Generativa</option>
                  <option value="otro">Otro Proyecto</option>
                </select>
              </div>
              <div className="f w">
                <label htmlFor="mensaje">Mensaje *</label>
                <textarea
                  id="mensaje"
                  name="mensaje"
                  rows={4}
                  required
                  placeholder="Cuéntanos sobre tu institución y cómo podemos ayudarte a transformar la educación..."
                ></textarea>
              </div>

              {/*
                Trap field for bots. Off-screen rather than `display:none`
                so a script that skips hidden inputs still fills it, and
                out of the tab order and the accessibility tree so nobody
                filling the form honestly can reach it. Kept away from
                the first position, where the form's first field is.
              */}
              <div aria-hidden="true" className="trap absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
                <label htmlFor="website">Sitio web</label>
                <input
                  type="text"
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  defaultValue=""
                  data-testid="contact-website"
                />
              </div>

              <button type="submit" disabled={isSubmitting} className="btn" data-testid="contact-submit">
                {isSubmitting ? 'Enviando...' : 'Enviar Mensaje'}
                {!isSubmitting && <span className="arr">→</span>}
              </button>
            </form>
          </div>
        </div>
      </section>

      <FlipbookDialog
        open={showDirectivesFlipbook}
        onClose={() => setShowDirectivesFlipbook(false)}
        title="Programa Estratégico Para Directivos"
        src={DIRECTIVOS_FLIPBOOK}
        externalHref={DIRECTIVOS_FLIPBOOK_TAB}
      />
    </SiteLayout>
  );
}
