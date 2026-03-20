import { Fragment, useState } from 'react';
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
  ArrowRight,
} from 'lucide-react';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';
import { generateProposalPDF } from '@/lib/propuestas-web/pdf-generator';
import { INTERNATIONAL_ADVISORS, FNE_CONTACT_EMAIL } from '@/lib/propuestas-web/constants';
import ConsultantCard from './ConsultantCard';
import ContentBlockSection from './ContentBlockSection';
import BucketDistribution from './BucketDistribution';

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
    } catch (err) {
      console.error('[PDF generation error]', err);
      toast.error('Error al generar el PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const programLabel =
    snapshot.type === 'evoluciona' ? 'Programa Evoluciona' : 'Programa Preparación';

  // Fallback photo map for FNE consultants whose DB foto_path may be null
  // Uses partial matching (first + last name substring) so "Arnoldo Cisternas Chávez" matches "Arnoldo Cisternas"
  const CONSULTANT_PHOTOS: Array<{ match: string; src: string }> = [
    { match: 'Arnoldo Cisternas', src: '/images/consultants/arnoldo-cisternas.png' },
    { match: 'Gabriela Naranjo', src: '/images/consultants/gabriela-naranjo.jpg' },
    { match: 'Ignacio', src: '/images/consultants/ignacio-pavez.jpg' },
  ];

  function findConsultantPhoto(name: string): string | null {
    const entry = CONSULTANT_PHOTOS.find((p) =>
      name.toLowerCase().includes(p.match.toLowerCase())
    );
    return entry?.src ?? null;
  }

  // Exclude international advisors from the FNE grid.
  // Check both categoria (new snapshots) and name match against the fixed advisor list
  // (old snapshots where categoria was not populated).
  const advisorNames = new Set(INTERNATIONAL_ADVISORS.map((a) => a.nombre.toLowerCase()));
  const fneConsultants = snapshot.consultants
    .filter(
      (c) =>
        c.categoria !== 'asesor_internacional' &&
        !advisorNames.has(c.nombre.toLowerCase())
    )
    .map((c) => ({
      ...c,
      fotoPath: c.fotoPath || findConsultantPhoto(c.nombre),
    }));

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, system-ui, sans-serif" }}>
      {/* ============================== */}
      {/* 1. HERO / COVER              */}
      {/* ============================== */}
      <section className="relative bg-[#0a0a0a] text-white overflow-hidden min-h-[90vh] flex items-end">
        {/* Solid black background — no image */}

        {/* Decorative geometric elements */}
        <div className="absolute top-20 right-12 sm:right-20 w-48 h-48 border border-[#fbbf24]/15 rounded-full pointer-events-none" />
        <div className="absolute top-28 right-20 sm:right-28 w-32 h-32 border border-[#fbbf24]/10 rounded-full pointer-events-none" />
        <div className="absolute bottom-40 right-8 w-px h-32 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />
        <div className="absolute top-1/3 left-0 w-24 h-px bg-gradient-to-r from-[#fbbf24]/20 to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-24 pt-32 sm:pt-40 w-full">
          <div className="mb-12">
            <Image
              src="/logos/fne-logo-gold.png"
              alt="Fundación Nueva Educación"
              width={180}
              height={60}
            />
          </div>

          {/* Gold accent bar */}
          <div className="w-16 h-1 bg-[#fbbf24] mb-6 rounded-full" />

          <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.3em] mb-6">
            {programLabel}
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] mb-8 max-w-4xl">
            {snapshot.serviceName}
          </h1>

          {/* Metadata strip */}
          <div className="flex flex-wrap items-center gap-4 text-white/60 mt-10 pt-8 border-t border-white/10">
            <span className="text-lg font-light">{snapshot.schoolName}</span>
            <span className="w-1 h-1 bg-[#fbbf24] rounded-full" />
            <span className="text-lg font-light">{snapshot.programYear}</span>
            {snapshot.cliente?.ciudad && (
              <>
                <span className="w-1 h-1 bg-[#fbbf24] rounded-full" />
                <span className="text-lg font-light">{snapshot.cliente.ciudad}</span>
              </>
            )}
            {snapshot.destinatarios && snapshot.destinatarios.length > 0 && (
              <>
                <span className="w-1 h-1 bg-[#fbbf24] rounded-full" />
                <span className="text-lg font-light">{snapshot.destinatarios.join(', ')}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 2. ABOUT FNE                 */}
      {/* ============================== */}
      <section className="relative bg-[#111111] text-white py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <Image src="/images/castellier-photo.png" alt="" fill className="object-cover opacity-[0.08]" />
          <div className="absolute inset-0 bg-gradient-to-l from-[#111111] via-[#111111]/90 to-[#111111]/80" />
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-12 w-px h-24 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-8 w-px h-24 bg-gradient-to-t from-[#fbbf24]/20 to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full" />
              <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em] mb-4">
                Quiénes Somos
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-8 leading-tight">
                Fundación Nueva Educación
              </h2>

              {/* Lead paragraph — pull-quote style */}
              <div className="border-l-4 border-[#fbbf24] pl-6 mb-8">
                <p className="text-xl text-white/80 leading-relaxed font-light">
                  Desde 2018, la Fundación Nueva Educación trabaja por la transformación
                  de comunidades educativas a través de la formación docente, el liderazgo
                  escolar y la innovación pedagógica.
                </p>
              </div>

              <p className="text-white/60 leading-relaxed mb-10">
                Nuestro equipo de consultores expertos diseña programas a medida que
                responden a las necesidades específicas de cada comunidad educativa,
                combinando metodologías probadas con enfoques innovadores.
              </p>

              {/* Stats — visual with proportional bars */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: Award, value: '6+', label: 'Años de experiencia', width: '75%' },
                  { icon: Globe, value: '3', label: 'Países', width: '38%' },
                  { icon: Target, value: '100+', label: 'Colegios acompañados', width: '100%' },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <stat.icon size={22} className="text-[#fbbf24] mx-auto mb-3" />
                    <p className="text-3xl font-bold text-white mb-1">{stat.value}</p>
                    <p className="text-xs text-white/50 mb-3">{stat.label}</p>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] rounded-full"
                        style={{ width: stat.width }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team photo — enhanced frame */}
            <div className="relative">
              <div className="absolute -inset-4 border border-[#fbbf24]/10 rounded-3xl pointer-events-none" />
              <div className="relative h-80 lg:h-[480px] rounded-2xl overflow-hidden shadow-2xl bg-[#111111]">
                <Image
                  src="/images/castellier-photo.png"
                  alt="Equipo FNE"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/50 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 3. CONSULTING MODEL           */}
      {/* ============================== */}
      <section className="relative bg-[#fafaf9] py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <Image src="/images/growth.png" alt="" fill className="object-cover opacity-[0.04]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#fafaf9] via-[#fafaf9]/95 to-[#fafaf9]" />
        </div>

        {/* Decorative circle */}
        <div className="absolute -bottom-20 -left-20 w-72 h-72 border border-[#fbbf24]/8 rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full" />
          <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em] mb-4">
            Nuestro Enfoque
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a0a0a] mb-14 leading-tight">
            Modelo de Consultoría
          </h2>

          {/* Phase cards — connected flow with arrows */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: '/images/icon-inicia.png',
                title: 'Inicia',
                number: '01',
                description:
                  'Diagnóstico y levantamiento de necesidades. Identificamos las áreas de mejora y establecemos la línea base.',
              },
              {
                icon: '/images/icon-inspira.png',
                title: 'Inspira',
                number: '02',
                description:
                  'Formación y acompañamiento. Implementamos programas de desarrollo profesional contextualizados.',
              },
              {
                icon: '/images/icon-evoluciona.png',
                title: 'Evoluciona',
                number: '03',
                description:
                  'Consolidación y autonomía. Aseguramos la sostenibilidad de los cambios y la transferencia de capacidades.',
              },
            ].map((phase, idx) => (
              <div key={phase.title} className="relative group">
                {/* Connecting arrow (not on last card) */}
                {idx < 2 && (
                  <div className="hidden sm:flex absolute top-1/2 -right-3 z-20 -translate-y-1/2">
                    <ArrowRight size={20} className="text-[#fbbf24]/40" />
                  </div>
                )}

                <div className="relative bg-white border-2 border-[#0a0a0a] rounded-2xl p-8 text-center hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1 h-full">
                  {/* Phase number */}
                  <span className="absolute top-4 right-4 text-5xl font-bold text-[#fbbf24]/10">
                    {phase.number}
                  </span>

                  <div className="relative w-16 h-16 mx-auto mb-5">
                    <Image src={phase.icon} alt={phase.title} fill className="object-contain" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0a0a0a] mb-3">{phase.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Model diagram — no frame */}
          <div className="relative w-full h-64 sm:h-80 lg:h-96">
            <Image
              src="/images/modelo-consultoria.png"
              alt="Modelo de Consultoría FNE"
              fill
              className="object-contain"
            />
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 4. CONSULTING TEAM            */}
      {/* ============================== */}
      {fneConsultants.length > 0 && (
        <section className="relative bg-white py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
          {/* Background illustration */}
          <div className="absolute inset-0 pointer-events-none">
            <Image src="/images/castellier.png" alt="" fill className="object-cover opacity-[0.04]" />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-white/90" />
          </div>

          {/* Decorative elements */}
          <div className="absolute top-0 left-8 w-px h-20 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />
          <div className="absolute -top-16 right-20 w-48 h-48 border border-[#fbbf24]/8 rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-5xl mx-auto">
            <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full" />
            <div className="flex items-center gap-3 mb-2">
              <Users size={24} className="text-[#fbbf24]" />
              <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em]">
                Equipo Asignado
              </p>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a0a0a] mb-12 leading-tight">
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
      {/* 5. INTERNATIONAL ADVISORS     */}
      {/* ============================== */}
      <section className="relative bg-[#0a0a0a] py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Solid black background — no illustration */}

        {/* Decorative */}
        <div className="absolute top-0 right-16 w-px h-28 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-12 w-px h-20 bg-gradient-to-t from-[#fbbf24]/20 to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full" />
          <p className="text-[#fbbf24] text-sm font-semibold uppercase tracking-[0.2em] mb-4">
            Red Internacional
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-12 leading-tight">
            Asesores Internacionales
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {INTERNATIONAL_ADVISORS.slice(0, -1).map((advisor, idx) => (
              <ConsultantCard key={idx} consultant={advisor} variant="advisor" />
            ))}
          </div>
          {/* Last advisor centered */}
          <div className="flex justify-center mt-8">
            <div className="w-full sm:w-1/2 sm:max-w-md">
              <ConsultantCard
                consultant={INTERNATIONAL_ADVISORS[INTERNATIONAL_ADVISORS.length - 1]}
                variant="advisor"
              />
            </div>
          </div>

          {/* Reference schools strip */}
          <div className="mt-16 pt-10 border-t border-white/10">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-[0.2em] mb-6 text-center">
              Centros de Referencia en Barcelona
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {[
                { src: '/images/schools/virolai.png', name: 'Virolai' },
                { src: '/images/schools/sadako.png', name: 'Sadako' },
                { src: '/images/schools/les-vinyes.png', name: 'Les Vinyes' },
                { src: '/images/schools/el-puig.png', name: 'El Puig' },
                { src: '/images/schools/octavio-paz.png', name: 'Octavio Paz' },
                { src: '/images/schools/angeleta-ferrer.png', name: 'Angeleta Ferrer' },
              ].map((school) => (
                <div key={school.name} className="text-center group">
                  <div className="relative w-16 h-16 mx-auto rounded-xl overflow-hidden bg-white/10 mb-2 group-hover:bg-white/20 transition-colors">
                    <Image
                      src={school.src}
                      alt={school.name}
                      fill
                      className="object-contain p-2"
                    />
                  </div>
                  <p className="text-white/30 text-[10px]">{school.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 6. CONTENT BLOCKS             */}
      {/* ============================== */}
      {snapshot.contentBlocks.map((block, idx) => (
        <Fragment key={block.key}>
          <ContentBlockSection
            block={block}
            variant={idx % 2 === 0 ? 'light' : 'dark'}
            index={idx}
          />
          {/* Clean decorative divider between blocks */}
          {idx < snapshot.contentBlocks.length - 1 && (
            <div className={`${idx % 2 === 0 ? 'bg-[#0a0a0a]' : 'bg-[#fafaf9]'}`}>
              <div className="max-w-5xl mx-auto flex items-center gap-4 px-4 sm:px-6 lg:px-8">
                <div className={`flex-1 h-px ${idx % 2 === 0 ? 'bg-white/10' : 'bg-[#0a0a0a]/8'}`} />
                <div className="w-2 h-2 bg-[#fbbf24] rounded-full" />
                <div className={`flex-1 h-px ${idx % 2 === 0 ? 'bg-white/10' : 'bg-[#0a0a0a]/8'}`} />
              </div>
            </div>
          )}
        </Fragment>
      ))}

      {/* ============================== */}
      {/* 6b. ACTIVITY BUCKETS          */}
      {/* ============================== */}
      {snapshot.buckets && snapshot.buckets.length > 0 && (
        <BucketDistribution buckets={snapshot.buckets} />
      )}

      {/* Hours distribution section removed — buckets shown in section 6b */}

      {/* ============================== */}
      {/* 8. ECONOMIC PROPOSAL          */}
      {/* ============================== */}
      <PricingSection pricing={snapshot.pricing} />

      {/* ============================== */}
      {/* 9. DOWNLOADABLES              */}
      {/* ============================== */}
      <DownloadablesSection documents={snapshot.documents} slug={slug} accessCode={accessCode} />

      {/* ============================== */}
      {/* 10. CONTACT INFO              */}
      {/* ============================== */}
      <section className="relative bg-[#fafaf9] py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <Image src="/images/barcelona-skyline.png" alt="" fill className="object-cover opacity-[0.04]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#fafaf9] via-[#fafaf9]/95 to-[#fafaf9]/90" />
        </div>

        {/* Decorative */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-[#fbbf24]/30 to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="w-12 h-1 bg-[#fbbf24] mb-6 rounded-full mx-auto" />
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a0a0a] mb-4 leading-tight">
            ¿Tienes preguntas?
          </h2>
          <p className="text-gray-500 text-lg mb-12 max-w-2xl mx-auto leading-relaxed">
            Nuestro equipo está disponible para resolver tus dudas y acompañarte en el
            proceso de toma de decisiones.
          </p>

          {/* Contact cards — enhanced */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto mb-12">
            <a
              href={`mailto:${FNE_CONTACT_EMAIL}`}
              className="relative bg-white border-2 border-[#0a0a0a] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-[#fbbf24] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              <Mail size={28} className="text-[#fbbf24] mx-auto mb-4" />
              <p className="font-bold text-[#0a0a0a] group-hover:text-[#fbbf24] transition-colors mb-2">
                Email
              </p>
              <p className="text-gray-400 text-sm">{FNE_CONTACT_EMAIL}</p>
            </a>
            <a
              href="tel:+56941623577"
              className="relative bg-white border-2 border-[#0a0a0a] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-[#fbbf24] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              <Phone size={28} className="text-[#fbbf24] mx-auto mb-4" />
              <p className="font-bold text-[#0a0a0a] group-hover:text-[#fbbf24] transition-colors mb-2">
                Teléfono
              </p>
              <p className="text-gray-400 text-sm">+56 9 4162 3577</p>
            </a>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleDownloadPDF}
              disabled={generatingPdf}
              className="inline-flex items-center justify-center gap-2 bg-[#fbbf24] text-[#0a0a0a] rounded-full px-10 py-4 font-bold hover:bg-[#f59e0b] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              {generatingPdf ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
              {generatingPdf ? 'Generando...' : 'Descargar PDF'}
            </button>
            <a
              href={`mailto:${FNE_CONTACT_EMAIL}`}
              className="inline-flex items-center justify-center gap-2 bg-[#0a0a0a] text-white rounded-full px-10 py-4 font-bold hover:bg-[#1f1f1f] transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <MessageSquare size={20} />
              Contactar
            </a>
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* 11. FOOTER                    */}
      {/* ============================== */}
      <footer className="bg-[#0a0a0a] text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          {/* Decorative divider */}
          <div className="flex justify-center mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-px bg-white/10" />
              <div className="w-2 h-2 bg-[#fbbf24] rounded-full" />
              <div className="w-12 h-px bg-white/10" />
            </div>
          </div>

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

          {/* Ficha objetivo */}
          {snapshot.fichaObjetivo && (
            <div className="mt-6 mb-4 max-w-2xl mx-auto">
              <p className="text-white/25 text-xs italic leading-relaxed border-l-2 border-[#fbbf24]/20 pl-4">
                {snapshot.fichaObjetivo}
              </p>
            </div>
          )}

          {/* Ficha & Licitación metadata */}
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
  );
}
