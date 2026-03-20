import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import {
  Mail,
  Phone,
  Download,
  MessageSquare,
  Globe,
  Users,
  Award,
  Target,
  Loader2,
} from 'lucide-react';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';
import { generateProposalPDF } from '@/lib/propuestas-web/pdf-generator';
import ConsultantCard from './ConsultantCard';
import ContentBlockSection from './ContentBlockSection';
import ModuleTimeline from './ModuleTimeline';
import PricingSection from './PricingSection';
import DownloadablesSection from './DownloadablesSection';

interface ProposalPublicViewProps {
  snapshot: ProposalSnapshot;
  slug: string;
  accessCode: string;
}

export default function ProposalPublicView({
  snapshot,
  slug,
  accessCode,
}: ProposalPublicViewProps) {
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleDownloadPDF = async () => {
    setGeneratingPdf(true);
    try {
      generateProposalPDF(snapshot);
      toast.success('PDF descargado');
    } catch {
      toast.error('Error al generar el PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const heroImage =
    snapshot.type === 'evoluciona' ? '/images/collaborative.png' : '/images/tractor.png';

  const programLabel =
    snapshot.type === 'evoluciona' ? 'Programa Evoluciona' : 'Programa Preparación';

  // Split consultants: those with international-sounding titles go to advisors section
  const fneConsultants = snapshot.consultants.filter(
    (c) =>
      !c.titulo.toLowerCase().includes('internacional') &&
      !c.titulo.toLowerCase().includes('asesor')
  );
  const internationalAdvisors = snapshot.consultants.filter(
    (c) =>
      c.titulo.toLowerCase().includes('internacional') ||
      c.titulo.toLowerCase().includes('asesor')
  );

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, system-ui, sans-serif" }}>
      {/* ============================== */}
      {/* 1. HERO / COVER */}
      {/* ============================== */}
      <section className="relative bg-[#0a0a0a] text-white overflow-hidden">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <Image src={heroImage} alt="" fill className="object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/80 via-[#0a0a0a]/60 to-[#0a0a0a]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
          <div className="mb-8">
            <Image
              src="/logos/fne-logo-gold.png"
              alt="Fundación Nueva Educación"
              width={160}
              height={53}
              className="mb-8"
            />
          </div>
          <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em] mb-4">
            {programLabel}
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            {snapshot.serviceName}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-white/70">
            <span className="text-lg">{snapshot.schoolName}</span>
            <span className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full" />
            <span className="text-lg">{snapshot.programYear}</span>
            {snapshot.destinatarios && snapshot.destinatarios.length > 0 && (
              <>
                <span className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full" />
                <span className="text-lg">{snapshot.destinatarios.join(', ')}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 2. ABOUT FNE */}
      {/* ============================== */}
      <section className="bg-[#1f1f1f] text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em] mb-4">
                Quiénes Somos
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                Fundación Nueva Educación
              </h2>
              <p className="text-white/70 leading-relaxed mb-6">
                Desde 2018, la Fundación Nueva Educación trabaja por la transformación
                de comunidades educativas a través de la formación docente, el liderazgo
                escolar y la innovación pedagógica. Con más de 6 años de experiencia,
                acompañamos a colegios en su proceso de mejora continua.
              </p>
              <p className="text-white/70 leading-relaxed mb-8">
                Nuestro equipo de consultores expertos diseña programas a medida que
                responden a las necesidades específicas de cada comunidad educativa,
                combinando metodologías probadas con enfoques innovadores.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-white/10 rounded-2xl p-4 text-center">
                  <Award size={24} className="text-[#fbbf24] mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">6+</p>
                  <p className="text-xs text-white/60">Años de experiencia</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4 text-center">
                  <Globe size={24} className="text-[#fbbf24] mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">3</p>
                  <p className="text-xs text-white/60">Países</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4 text-center">
                  <Target size={24} className="text-[#fbbf24] mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">100+</p>
                  <p className="text-xs text-white/60">Colegios acompañados</p>
                </div>
              </div>
            </div>

            <div className="relative h-80 lg:h-[450px] rounded-2xl overflow-hidden">
              <Image
                src="/images/faces.png"
                alt="Equipo FNE"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 3. CONSULTING MODEL */}
      {/* ============================== */}
      <section className="bg-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em] mb-4">
            Nuestro Enfoque
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0a0a0a] mb-10">
            Modelo de Consultoría
          </h2>

          {/* Phase cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            {[
              {
                icon: '/images/icon-inicia.png',
                title: 'Inicia',
                description:
                  'Diagnóstico y levantamiento de necesidades. Identificamos las áreas de mejora y establecemos la línea base.',
              },
              {
                icon: '/images/icon-inspira.png',
                title: 'Inspira',
                description:
                  'Formación y acompañamiento. Implementamos programas de desarrollo profesional contextualizados.',
              },
              {
                icon: '/images/icon-evoluciona.png',
                title: 'Evoluciona',
                description:
                  'Consolidación y autonomía. Aseguramos la sostenibilidad de los cambios y la transferencia de capacidades.',
              },
            ].map((phase) => (
              <div
                key={phase.title}
                className="border-2 border-[#0a0a0a] rounded-2xl p-6 text-center hover:shadow-lg transition-shadow"
              >
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <Image src={phase.icon} alt={phase.title} fill className="object-contain" />
                </div>
                <h3 className="text-xl font-bold text-[#0a0a0a] mb-2">{phase.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{phase.description}</p>
              </div>
            ))}
          </div>

          {/* Model diagram */}
          <div className="relative w-full h-64 sm:h-80 lg:h-96 rounded-2xl overflow-hidden border-2 border-[#0a0a0a]">
            <Image
              src="/images/modelo-consultoria.png"
              alt="Modelo de Consultoría FNE"
              fill
              className="object-contain p-4"
            />
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 4. CONSULTING TEAM */}
      {/* ============================== */}
      {fneConsultants.length > 0 && (
        <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <Users size={28} className="text-[#fbbf24]" />
              <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em]">
                Equipo Asignado
              </p>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0a0a0a] mb-10">
              Equipo de Consultoría
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {fneConsultants.map((consultant, idx) => (
                <ConsultantCard key={idx} consultant={consultant} variant="fne" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================== */}
      {/* 5. INTERNATIONAL ADVISORS */}
      {/* ============================== */}
      {internationalAdvisors.length > 0 && (
        <section className="relative bg-[#0a0a0a] py-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0">
            <Image
              src="/images/sagrada-familia.png"
              alt=""
              fill
              className="object-cover opacity-10"
            />
            <div className="absolute inset-0 bg-[#0a0a0a]/80" />
          </div>

          <div className="relative z-10 max-w-5xl mx-auto">
            <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em] mb-4">
              Red Internacional
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-10">
              Asesores Internacionales
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {internationalAdvisors.map((advisor, idx) => (
                <ConsultantCard key={idx} consultant={advisor} variant="advisor" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================== */}
      {/* 6. CONTENT BLOCKS */}
      {/* ============================== */}
      {snapshot.contentBlocks.map((block, idx) => (
        <ContentBlockSection
          key={block.key}
          block={block}
          variant={idx % 2 === 0 ? 'light' : 'dark'}
        />
      ))}

      {/* ============================== */}
      {/* 7. MODULES & HOURS */}
      {/* ============================== */}
      <ModuleTimeline
        modules={snapshot.modules}
        totalHours={snapshot.totalHours}
        horasPresenciales={snapshot.horasPresenciales}
        horasSincronicas={snapshot.horasSincronicas}
        horasAsincronicas={snapshot.horasAsincronicas}
      />

      {/* ============================== */}
      {/* 8. ECONOMIC PROPOSAL */}
      {/* ============================== */}
      <PricingSection pricing={snapshot.pricing} modules={snapshot.modules} />

      {/* ============================== */}
      {/* 9. DOWNLOADABLES */}
      {/* ============================== */}
      <DownloadablesSection documents={snapshot.documents} slug={slug} accessCode={accessCode} />

      {/* ============================== */}
      {/* 10. CONTACT INFO */}
      {/* ============================== */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0a0a0a] mb-4">
            ¿Tienes preguntas?
          </h2>
          <p className="text-gray-600 text-lg mb-10 max-w-2xl mx-auto">
            Nuestro equipo está disponible para resolver tus dudas y acompañarte en el
            proceso de toma de decisiones.
          </p>

          {/* Contact cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto mb-10">
            <a
              href="mailto:contacto@fundacionnuevaeducacion.com"
              className="border-2 border-[#0a0a0a] rounded-2xl p-6 hover:bg-white transition-colors group"
            >
              <Mail size={28} className="text-[#fbbf24] mx-auto mb-3" />
              <p className="font-bold text-[#0a0a0a] group-hover:text-[#fbbf24] transition-colors">
                Email
              </p>
              <p className="text-gray-500 text-sm mt-1">contacto@fundacionnuevaeducacion.com</p>
            </a>
            <a
              href="tel:+56912345678"
              className="border-2 border-[#0a0a0a] rounded-2xl p-6 hover:bg-white transition-colors group"
            >
              <Phone size={28} className="text-[#fbbf24] mx-auto mb-3" />
              <p className="font-bold text-[#0a0a0a] group-hover:text-[#fbbf24] transition-colors">
                Teléfono
              </p>
              <p className="text-gray-500 text-sm mt-1">+56 9 1234 5678</p>
            </a>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleDownloadPDF}
              disabled={generatingPdf}
              className="inline-flex items-center justify-center gap-2 bg-[#fbbf24] text-[#0a0a0a] rounded-full px-8 py-3 font-bold hover:bg-[#f59e0b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generatingPdf ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
              {generatingPdf ? 'Generando...' : 'Descargar PDF'}
            </button>
            <a
              href="mailto:contacto@fundacionnuevaeducacion.com"
              className="inline-flex items-center justify-center gap-2 bg-[#0a0a0a] text-white rounded-full px-8 py-3 font-bold hover:bg-[#1f1f1f] transition-colors"
            >
              <MessageSquare size={20} />
              Contactar
            </a>
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 11. FOOTER */}
      {/* ============================== */}
      <footer className="bg-[#0a0a0a] text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <Image
            src="/logos/fne-logo-gold.png"
            alt="Fundación Nueva Educación"
            width={120}
            height={40}
            className="mx-auto mb-4"
          />
          <p className="text-white/60 text-sm mb-2">
            Transformando comunidades educativas
          </p>

          {/* Ficha & Licitación metadata */}
          {(snapshot.ficha || snapshot.licitacion) && (
            <div className="mt-4 mb-4 text-white/40 text-xs space-y-1">
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

          <p className="text-white/40 text-xs">
            &copy; {new Date().getFullYear()} Fundación Nueva Educación. Todos los derechos
            reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
