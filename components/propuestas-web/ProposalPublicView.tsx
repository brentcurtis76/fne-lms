import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import {
  Award,
  Download,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Target,
} from 'lucide-react';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';
import { generateProposalPDF } from '@/lib/propuestas-web/pdf-generator';
import { FNE_CONTACT_EMAIL, INTERNATIONAL_ADVISORS } from '@/lib/propuestas-web/constants';
import ConsultantCard from './ConsultantCard';
import ContentBlockSection from './ContentBlockSection';
import BucketDistribution from './BucketDistribution';
import BucketTimeline from './BucketTimeline';
import PricingSection from './PricingSection';
import DownloadablesSection from './DownloadablesSection';

interface ProposalPublicViewProps {
  snapshot: ProposalSnapshot;
  slug: string;
  accessCode: string;
}

interface IndexSection {
  id: string;
  label: string;
}

const CONSULTANT_PHOTOS: Array<{ match: string; src: string }> = [
  { match: 'Arnoldo Cisternas', src: '/images/consultants/arnoldo-cisternas.png' },
  { match: 'Gabriela Naranjo', src: '/images/consultants/gabriela-naranjo.jpg' },
  { match: 'Ignacio', src: '/images/consultants/ignacio-pavez.jpg' },
];

const PHASES = [
  {
    title: 'Inicia',
    number: '01',
    description:
      'Diagnóstico y levantamiento de necesidades. Identificamos las áreas de mejora y establecemos la línea base.',
  },
  {
    title: 'Inspira',
    number: '02',
    description:
      'Formación y acompañamiento. Implementamos programas de desarrollo profesional contextualizados.',
  },
  {
    title: 'Evoluciona',
    number: '03',
    description:
      'Consolidación y autonomía. Aseguramos la sostenibilidad de los cambios y la transferencia de capacidades.',
  },
];

const REFERENCE_SCHOOLS = [
  { src: '/images/schools/virolai.png', name: 'Escola Virolai', leader: 'Coral Regí · Sandra Entrena' },
  { src: '/images/schools/sadako.png', name: 'Escola Sadako', leader: 'Jordi Mussons' },
  { src: '/images/schools/les-vinyes.png', name: 'IE Les Vinyes', leader: 'Sergi Del Moral · Betlem Cuesta' },
  { src: '/images/schools/el-puig.png', name: 'Escola El Puig', leader: 'Carol Giralt' },
  { src: '/images/schools/octavio-paz.png', name: 'Escola Octavio Paz', leader: 'Ana Vicálvaro' },
  { src: '/images/schools/angeleta-ferrer.png', name: 'Institut Angeleta Ferrer', leader: 'Boris Mir · Abraham De La Fuente' },
];

function findConsultantPhoto(name: string): string | null {
  const entry = CONSULTANT_PHOTOS.find((photo) =>
    name.toLowerCase().includes(photo.match.toLowerCase())
  );
  return entry?.src ?? null;
}

export default function ProposalPublicView({
  snapshot,
  slug,
  accessCode,
}: ProposalPublicViewProps) {
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [activeSection, setActiveSection] = useState('about');
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleDownloadPDF = async () => {
    setGeneratingPdf(true);
    try {
      generateProposalPDF(snapshot);
      toast.success('PDF descargado');
    } catch (err) {
      console.error('[PDF generation error]', err);
      toast.error('Error al generar el PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const programLabel =
    snapshot.type === 'evoluciona' ? 'Programa Evoluciona' : 'Programa Preparación';

  const advisorNames = new Set(INTERNATIONAL_ADVISORS.map((advisor) => advisor.nombre.toLowerCase()));
  const fneConsultants = snapshot.consultants
    .filter(
      (consultant) =>
        consultant.categoria !== 'asesor_internacional' &&
        !advisorNames.has(consultant.nombre.toLowerCase())
    )
    .map((consultant) => ({
      ...consultant,
      fotoPath: consultant.fotoPath || findConsultantPhoto(consultant.nombre),
    }));

  const hasBuckets = Boolean(snapshot.buckets && snapshot.buckets.length > 0);
  const hasDocuments = snapshot.documents.length > 0;

  const indexSections = useMemo<IndexSection[]>(() => {
    const sections: IndexSection[] = [
      { id: 'about', label: 'Fundación Nueva Educación' },
      { id: 'model', label: 'Modelo de Consultoría' },
    ];

    if (fneConsultants.length > 0) {
      sections.push({ id: 'team', label: 'Equipo de Consultoría' });
    }

    sections.push({ id: 'advisors', label: 'Asesores Internacionales' });

    snapshot.contentBlocks.forEach((block, index) => {
      sections.push({ id: `contenido-${index + 1}`, label: block.titulo });
    });

    if (hasBuckets) {
      sections.push({ id: 'actividades', label: 'Distribución de Actividades' });
      sections.push({ id: 'timeline', label: 'Línea de Tiempo del Programa' });
    }

    sections.push({ id: 'propuesta-economica', label: 'Propuesta Económica' });

    if (hasDocuments) {
      sections.push({ id: 'documentos', label: 'Documentos de Respaldo' });
    }

    sections.push({ id: 'contacto', label: '¿Tienes preguntas?' });
    return sections;
  }, [fneConsultants.length, hasBuckets, hasDocuments, snapshot.contentBlocks]);

  useEffect(() => {
    const updateScrollState = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0;
      setScrollProgress(progress);

      const offset = window.innerHeight * 0.35;
      let current = indexSections[0]?.id || 'about';
      for (const section of indexSections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= offset) {
          current = section.id;
        }
      }
      setActiveSection(current);
    };

    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      window.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [indexSections]);

  return (
    <div className="propuesta-web">
      <div className="pw-shell">
        <header className="pw-topbar">
          <div className="pw-wrap pw-topbar__inner">
            <Image
              src="/logos/fne-logo-bw.png"
              alt="Fundación Nueva Educación"
              width={169}
              height={60}
              priority
              className="pw-topbar__logo"
            />
            <div className="pw-topbar__meta">
              <span>{snapshot.schoolName}</span>
              <span className="pw-dot" />
              <span>{snapshot.programYear}</span>
            </div>
          </div>
        </header>
        <div
          className="pw-progress"
          style={{ '--progress': `${scrollProgress}%` } as CSSProperties}
        />

        <aside className="pw-side-index" aria-label="Índice de secciones">
          <p className="pw-side-index__label">Índice</p>
          <nav className="pw-side-index__nav">
            {indexSections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                title={section.label}
                className={`pw-side-index__link ${activeSection === section.id ? 'is-active' : ''}`}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <span>{section.label}</span>
              </a>
            ))}
          </nav>
        </aside>

        <section className="pw-section pw-hero" id="hero">
          <span className="pw-watermark">{snapshot.type === 'evoluciona' ? 'Evoluciona' : 'Preparación'}</span>
          <div className="pw-wrap">
            <div className="pw-hero__content">
              <p className="pw-kicker">{programLabel}</p>
              <h1 className="pw-display pw-hero__title">{snapshot.serviceName}</h1>

              <div className="pw-hero__meta">
                <span>{snapshot.schoolName}</span>
                <span className="pw-dot" />
                <span>{snapshot.programYear}</span>
                {snapshot.cliente?.ciudad && (
                  <>
                    <span className="pw-dot" />
                    <span>{snapshot.cliente.ciudad}</span>
                  </>
                )}
                {snapshot.destinatarios && snapshot.destinatarios.length > 0 && (
                  <>
                    <span className="pw-dot" />
                    <span>{snapshot.destinatarios.join(', ')}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="pw-section pw-index" id="indice">
          <div className="pw-wrap pw-index__grid">
            <div>
              <p className="pw-kicker mb-5">Contenido</p>
              <h2 className="pw-h2">Índice</h2>
            </div>
            <div className="pw-index__list">
              {indexSections.map((section, index) => (
                <a key={section.id} href={`#${section.id}`} className="pw-index__item">
                  <span className="pw-index__number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="pw-index__title">{section.label}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="pw-section pw-section--dark" id="about">
          <div className="pw-wrap pw-section__grid pw-section__grid--two">
            <div>
              <p className="pw-kicker mb-5">Quiénes Somos</p>
              <h2 className="pw-h2">Fundación Nueva Educación</h2>
            </div>
            <div>
              <div className="pw-quote-panel mb-8">
                <p className="pw-lede">
                  Desde 2018, la Fundación Nueva Educación trabaja por la transformación
                  de comunidades educativas a través de la formación docente, el liderazgo
                  escolar y la innovación pedagógica.
                </p>
              </div>
              <p className="pw-body">
                Nuestro equipo de consultores expertos diseña programas a medida que
                responden a las necesidades específicas de cada comunidad educativa,
                combinando metodologías probadas con enfoques innovadores.
              </p>

              <div className="pw-stats-row">
                {[
                  { icon: Award, value: '6+', label: 'Años de experiencia' },
                  { icon: Globe, value: '3', label: 'Países' },
                  { icon: Target, value: '100+', label: 'Colegios acompañados' },
                ].map((stat) => (
                  <div key={stat.label} className="pw-stat">
                    <stat.icon size={22} className="text-[#fbbf24] mb-4" />
                    <span className="pw-stat__value">{stat.value}</span>
                    <span className="pw-stat__label">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pw-section pw-section--cream" id="model">
          <div className="pw-wrap">
            <div className="mb-12">
              <p className="pw-kicker mb-5">Nuestro Enfoque</p>
              <h2 className="pw-h2">Modelo de Consultoría</h2>
            </div>
            <div className="pw-phases">
              {PHASES.map((phase) => (
                <article key={phase.title} className="pw-phase">
                  <span className="pw-phase__number">{phase.number}</span>
                  <h3 className="pw-phase__title">{phase.title}</h3>
                  <p className="pw-phase__text">{phase.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {fneConsultants.length > 0 && (
          <section className="pw-section" id="team">
            <div className="pw-wrap">
              <div className="mb-12">
                <p className="pw-kicker mb-5">Equipo Asignado</p>
                <h2 className="pw-h2">Equipo de Consultoría</h2>
              </div>
              <div className="pw-team-grid">
                {fneConsultants.map((consultant, index) => (
                  <ConsultantCard key={`${consultant.nombre}-${index}`} consultant={consultant} variant="fne" />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="pw-section pw-section--dark" id="advisors">
          <div className="pw-wrap">
            <div className="mb-12">
              <p className="pw-kicker mb-5">Red Internacional</p>
              <h2 className="pw-h2">Asesores Internacionales</h2>
            </div>

            <div className="pw-team-grid">
              {INTERNATIONAL_ADVISORS.map((advisor, index) => (
                <ConsultantCard key={`${advisor.nombre}-${index}`} consultant={advisor} variant="advisor" />
              ))}
            </div>

            <div className="mt-20 pt-12 border-t border-white/10">
              <p className="text-white/50 text-xs font-black uppercase tracking-[0.3em] mb-8">
                Centros de Referencia en Barcelona
              </p>
              <div className="pw-schools-grid">
                {REFERENCE_SCHOOLS.map((school) => (
                  <article key={school.name} className="pw-school">
                    <div className="pw-school__logo">
                      <Image
                        src={school.src}
                        alt={school.name}
                        fill
                        className="object-contain p-2"
                      />
                    </div>
                    <div>
                      <p className="text-white/80 text-sm font-black leading-tight">
                        {school.name}
                      </p>
                      {school.leader && (
                        <p className="text-white/30 text-[11px] mt-1">{school.leader}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {snapshot.contentBlocks.map((block, index) => (
          <ContentBlockSection
            key={block.key}
            block={block}
            variant={index % 2 === 0 ? 'light' : 'dark'}
            index={index}
            sectionId={`contenido-${index + 1}`}
          />
        ))}

        {hasBuckets && <BucketDistribution buckets={snapshot.buckets!} />}

        {hasBuckets && (
          <section id="timeline" className="pw-section pw-section--cream">
            <div className="pw-wrap">
              <BucketTimeline buckets={snapshot.buckets!} />
            </div>
          </section>
        )}

        <PricingSection pricing={snapshot.pricing} />

        {hasDocuments && (
          <DownloadablesSection documents={snapshot.documents} slug={slug} accessCode={accessCode} />
        )}

        <section className="pw-section pw-section--yellow pw-cta" id="contacto">
          <div className="pw-narrow text-center">
            <p className="pw-kicker mb-5 justify-center">Contacto</p>
            <h2 className="pw-h2 mb-5">¿Tienes preguntas?</h2>
            <p className="pw-lede mx-auto mb-12">
              Nuestro equipo está disponible para resolver tus dudas y acompañarte en el
              proceso de toma de decisiones.
            </p>

            <div className="pw-contact-grid mb-10">
              <a href={`mailto:${FNE_CONTACT_EMAIL}`} className="pw-contact-card">
                <Mail size={26} className="mx-auto mb-4" />
                <p className="font-black mb-1">Email</p>
                <p className="text-sm text-[#0a0a0a]/60">{FNE_CONTACT_EMAIL}</p>
              </a>
              <a href="tel:+56941623577" className="pw-contact-card">
                <Phone size={26} className="mx-auto mb-4" />
                <p className="font-black mb-1">Teléfono</p>
                <p className="text-sm text-[#0a0a0a]/60">+56 9 4162 3577</p>
              </a>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={generatingPdf}
                className="pw-btn pw-btn--ink"
              >
                {generatingPdf ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                {generatingPdf ? 'Generando...' : 'Descargar PDF'}
              </button>
              <a href={`mailto:${FNE_CONTACT_EMAIL}`} className="pw-btn pw-btn--outline">
                <MessageSquare size={20} />
                Contactar
              </a>
            </div>
          </div>
        </section>

        <footer className="pw-colophon">
          <div className="pw-narrow text-center">
            <Image
              src="/logos/fne-logo-gold.png"
              alt="Fundación Nueva Educación"
              width={140}
              height={47}
              className="mx-auto mb-5"
            />
            <p className="text-white/50 text-sm mb-3">
              Transformando comunidades educativas
            </p>

            {snapshot.fichaObjetivo && (
              <div className="mt-6 mb-4 max-w-2xl mx-auto">
                <p className="text-white/25 text-xs italic leading-relaxed border-l-2 border-[#fbbf24]/20 pl-4">
                  {snapshot.fichaObjetivo}
                </p>
              </div>
            )}

            {(snapshot.ficha || snapshot.licitacion) && (
              <div className="mt-6 mb-6 text-white/30 text-xs space-y-1">
                {snapshot.ficha && (
                  <p>
                    {snapshot.ficha.nombre_servicio} — {snapshot.ficha.dimension}
                    {snapshot.ficha.categoria ? ` · ${snapshot.ficha.categoria}` : ''}
                    {snapshot.ficha.folio ? ` · Folio ${snapshot.ficha.folio}` : ''}
                  </p>
                )}
                {snapshot.licitacion && (
                  <p>
                    Licitación {snapshot.licitacion.numero} — {snapshot.licitacion.nombre} ({snapshot.licitacion.year})
                  </p>
                )}
              </div>
            )}

            <p className="text-white/30 text-xs">
              &copy; {new Date().getFullYear()} Fundación Nueva Educación. Todos los derechos
              reservados.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
