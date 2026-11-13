import React from 'react';
import Link from 'next/link';
import SiteLayout from '../components/site/SiteLayout';
import TeamSection from '../components/site/TeamSection';

const VERBS = [
  {
    name: 'Transformar',
    art: '/sitio/linea-hands.png',
    text: 'Acompañamos a las comunidades educativas en procesos profundos de transformación cultural, facilitando el cambio desde adentro. Trabajamos codo a codo con directivos, docentes, estudiantes y familias para co-crear una nueva cultura escolar centrada en el desarrollo integral y el bienestar de toda la comunidad.',
  },
  {
    name: 'Conectar',
    art: '/sitio/linea-hanging-bridge.png',
    text: 'Sinergizamos redes vivas de colaboración entre escuelas innovadoras de Chile, España y América Latina. Estas redes permiten que las comunidades educativas compartan sus experiencias, aprendan unas de otras y co-construyan soluciones a desafíos comunes. A través de pasantías internacionales, encuentros y programas formativos, creamos un ecosistema de aprendizaje que trasciende fronteras.',
  },
  {
    name: 'Innovar',
    art: '/sitio/linea-growth.png',
    text: 'Desarrollamos herramientas e instrumentos propios para implementar, medir y ejecutar procesos de transformación educativa. Creamos metodologías de diagnóstico, matrices de evaluación, protocolos de implementación y sistemas de seguimiento que permiten a las escuelas gestionar su cambio de manera sistemática, medible y sostenible en el tiempo.',
  },
];

export default function NosotrosPage() {
  return (
    <SiteLayout
      active="nosotros"
      title="Nosotros · Fundación Nueva Educación"
      description="Somos una red que reflexiona y crea soluciones para la educación del siglo XXI: un equipo multidisciplinario experto en procesos de cambio cultural en el mundo de la educación."
    >
      <section className="phero">
        <div className="iso" aria-hidden="true">
          <i className="mark line spin" style={{ background: '#fff' }} />
        </div>
        <i className="art" aria-hidden="true" style={{ ['--m' as string]: 'url(/sitio/linea-castellier.png)' }} />
        <div className="wrap">
          <div className="eyebrow rv">Nosotros</div>
          <h1 className="rv" style={{ maxWidth: '24ch' }}>
            <span className="l">Somos una red que reflexiona y crea</span> soluciones para la educación del siglo XXI
          </h1>
          <p className="lead rv">
            Un equipo multidisciplinario de expertos en facilitar procesos de Cambio Cultural en el mundo de la
            educación, pioneros en la aplicación de los principios de la Nueva Educación en programas de formación
            para estudiantes y programas de cambio en equipos directivos y docentes.
          </p>
        </div>
      </section>

      <section className="verbos" id="que-hacemos">
        <div className="wrap">
          <h2 className="eyebrow rv" style={{ marginBottom: 26, color: 'var(--azul)' }}>Lo que hacemos</h2>
          <ol>
            {VERBS.map((verb, index) => (
              <li className="rv" key={verb.name}>
                <span className="n">{String(index + 1).padStart(2, '0')}</span>
                <h3>{verb.name}</h3>
                <p>{verb.text}</p>
                <i className="art" aria-hidden="true" style={{ ['--m' as string]: `url(${verb.art})` }} />
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="impacto" id="impacto">
        <i className="mark line deco spin" aria-hidden="true" />
        <div className="wrap">
          <div className="eyebrow rv">Nuestro impacto</div>
          <h2 className="rv">
            <span className="l">Una red que</span> ya está cambiando escuelas
          </h2>
          <div className="cifras rv">
            <div>
              <b data-n="12">12</b>
              <span>Escuelas de vanguardia colaboradoras en Barcelona</span>
            </div>
            <div>
              <b data-n="33">33</b>
              <span>Colegios han pasado por nuestros programas de transformación</span>
            </div>
            <div>
              <b data-n="400" data-pre="+">+400</b>
              <span>Pasantes internacionales a Barcelona</span>
            </div>
            <div>
              <b data-n="40" data-pre="+">+40</b>
              <span>Colegios han confiado en nuestros programas de pasantías internacionales</span>
            </div>
          </div>
        </div>
      </section>

      <TeamSection />

      <section className="cierre">
        <i className="mark line deco spin" aria-hidden="true" />
        <div className="wrap">
          <h2 className="rv">
            <span className="l">La escuela se transforma</span> desde sus vínculos
          </h2>
          <p className="rv">Conversemos sobre cómo podemos acompañar a tu comunidad educativa.</p>
          <div className="cta rv">
            <Link className="btn mag" href="/#contacto" data-testid="nosotros-cierre-contacto">
              Conversemos <span className="arr">→</span>
            </Link>
            <Link className="btn ghost" href="/programas" data-testid="nosotros-cierre-programas">
              Ver los programas
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
