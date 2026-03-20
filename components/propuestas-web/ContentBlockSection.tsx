import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { SnapshotContentBlock } from '@/lib/propuestas-web/snapshot';

/* ──────────────────────────── image mapping ──────────────────────────── */

const TITLE_IMAGE_MAP: Array<{ match: string; src: string }> = [
  { match: 'Fases INICIA', src: '/images/7vias-photo.png' },
  { match: 'Elementos Centrales', src: '/images/children-on-ladder-photo.png' },
  { match: 'Generación Tractor', src: '/images/tractor-photo.png' },
  { match: 'Proyecto Innova', src: '/images/collaborative-photo.png' },
  { match: 'Acompañamiento Técnico', src: '/images/tibidabo-photo.png' },
  { match: 'Comunidades de Crecimiento', src: '/images/hands-photo.png' },
  { match: 'Estadías INSPIRA', src: '/images/barcelona-skyline-photo.png' },
  { match: 'Educación Relacional', src: '/images/hanging-bridge-photo.png' },
  { match: 'Plataforma de Crecimiento', src: '/images/growth-photo.png' },
];

const FALLBACK_IMAGES = [
  '/images/huddle-photo.png',
  '/images/collaborative-photo.png',
  '/images/castellier-photo.png',
  '/images/tibidabo-photo.png',
  '/images/tractor-photo.png',
  '/images/sagrada-familia-photo.png',
];

function getImageForBlock(title: string, index: number): string {
  const entry = TITLE_IMAGE_MAP.find((e) =>
    title.toLowerCase().includes(e.match.toLowerCase())
  );
  if (entry) return entry.src;
  return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

/* ──────────────────────── pull-quote extraction ──────────────────────── */

/** Extract a short, punchy sentence from a paragraph for visual display */
function extractPullQuote(text: string): string | null {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return null;

  const candidates = sentences
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 150);

  // Prefer definitional / impactful sentences
  const strong = candidates.find((s) =>
    /\b(es|son|significa|transforma|genera|permite|promueve|busca|propone|requiere|implica|favorece)\b/i.test(s)
  );

  return strong || candidates[0] || null;
}

/** Splits paragraph so first sentence can be bolded for scanning */
function splitFirstSentence(text: string): [string | null, string] {
  const match = text.match(/^(.+?[.:])(\s+.+)$/s);
  if (match && match[1].length < 180 && match[2].trim().length > 30) {
    return [match[1], match[2].trim()];
  }
  return [null, text];
}

/**
 * Detect inline numbered elements like "(1) Foo, (2) Bar, (3) Baz"
 * and split into a lead sentence + array of items.
 */
function splitNumberedElements(text: string): { lead: string; items: string[] } | null {
  // Must contain at least (1) and (2)
  if (!/\(1\)/.test(text) || !/\(2\)/.test(text)) return null;

  // Split on the pattern: everything before (1) is the lead
  const leadMatch = text.match(/^(.*?)\s*\(1\)\s*/s);
  if (!leadMatch) return null;
  const lead = leadMatch[1].replace(/:\s*$/, '').trim();

  // Extract each numbered item: (N) content until next (N+1) or end
  const items: string[] = [];
  const itemPattern = /\((\d+)\)\s*(.*?)(?=\s*\(\d+\)|$)/gs;
  let m;
  while ((m = itemPattern.exec(text)) !== null) {
    // Clean up trailing punctuation like "; y" or ";"
    const content = m[2].replace(/[;,]\s*(y\s*)?$/, '').replace(/\.\s*$/, '').trim();
    if (content) items.push(content);
  }

  return items.length >= 2 ? { lead, items } : null;
}

/* ──────────────────────────── component ──────────────────────────────── */

interface ContentBlockSectionProps {
  block: SnapshotContentBlock;
  variant: 'dark' | 'light';
  index: number;
}

export default function ContentBlockSection({ block, variant, index }: ContentBlockSectionProps) {
  const isDark = variant === 'dark';
  const illustration = getImageForBlock(block.titulo, index);

  const sections = block.contenido.sections;
  const firstParagraphIdx = sections.findIndex((s) => s.type === 'paragraph');
  const imageOnLeft = index % 2 !== 0;

  const titleNorm = block.titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  let paragraphCount = 0;

  /* ─── pull quote component ─── */
  const PullQuote = ({ text }: { text: string }) => (
    <div
      className={`my-10 py-8 border-y ${
        isDark ? 'border-[#fbbf24]/20' : 'border-[#fbbf24]/25'
      }`}
    >
      <p
        className={`text-xl sm:text-2xl font-light text-center leading-snug max-w-[48ch] mx-auto ${
          isDark ? 'text-[#fbbf24]/70' : 'text-[#fbbf24]/80'
        }`}
      >
        &ldquo;{text.replace(/[.!?]+$/, '')}&rdquo;
      </p>
    </div>
  );

  /* ─── key insight card ─── */
  const InsightCard = ({ text }: { text: string }) => (
    <div
      className={`my-8 rounded-xl p-5 flex items-start gap-4 ${
        isDark
          ? 'bg-[#fbbf24]/[0.06] border border-[#fbbf24]/15'
          : 'bg-[#fbbf24]/[0.05] border border-[#fbbf24]/20'
      }`}
    >
      <span className="flex-shrink-0 w-8 h-8 bg-[#fbbf24]/15 rounded-lg flex items-center justify-center mt-0.5">
        <span className="text-[#fbbf24] text-sm">✦</span>
      </span>
      <p
        className={`text-sm leading-relaxed font-medium max-w-[58ch] ${
          isDark ? 'text-white/80' : 'text-[#0a0a0a]/80'
        }`}
      >
        {text}
      </p>
    </div>
  );

  /* ─── section renderer ─── */
  const renderSection = (
    section: (typeof sections)[number],
    idx: number,
    isFirst: boolean
  ) => {
    switch (section.type) {
      case 'heading': {
        paragraphCount = 0;
        const headingNorm = (section.text || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

        // Skip headings that are redundant with the block title.
        // Uses word-overlap: if >50% of content words match, it's redundant.
        const stopWords = new Set(['el','la','los','las','de','del','en','un','una','y','a','por','para','con','que','se','su','al','es','lo','son','como','más','o','e','las','nos','sus']);
        const titleWords = titleNorm.split(/\s+/).filter(w => !stopWords.has(w) && w.length > 1);
        const headingWords = headingNorm.split(/\s+/).filter(w => !stopWords.has(w) && w.length > 1);
        const titleSet = new Set(titleWords);
        const overlap = headingWords.filter(w => titleSet.has(w)).length;
        const isRedundant =
          headingNorm === titleNorm ||
          titleNorm.includes(headingNorm) ||
          headingNorm.includes(titleNorm) ||
          (titleWords.length > 0 && overlap / titleWords.length >= 0.5);
        if (isRedundant) return null;

        // Heading card treatment — not just text
        return (
          <div
            key={idx}
            className={`mt-12 mb-5 rounded-xl px-5 py-4 ${
              isDark
                ? 'bg-white/[0.03] border-l-4 border-[#fbbf24]'
                : 'bg-[#0a0a0a]/[0.03] border-l-4 border-[#fbbf24]'
            }`}
          >
            <h3
              className={`${
                section.level === 3 ? 'text-lg' : 'text-xl sm:text-2xl'
              } font-bold ${isDark ? 'text-white' : 'text-[#0a0a0a]'}`}
            >
              {section.text}
            </h3>
          </div>
        );
      }

      case 'paragraph': {
        const text = section.text || '';
        paragraphCount++;

        // Lead paragraph — drop cap + border accent
        if (isFirst) {
          const firstChar = text.charAt(0);
          const restText = text.slice(1);

          return (
            <div key={idx} className="my-8">
              <div className="border-l-4 border-[#fbbf24] pl-5 sm:pl-7 py-2 max-w-[62ch]">
                <p
                  className={`text-lg sm:text-xl leading-[1.8] font-light ${
                    isDark ? 'text-white/90' : 'text-[#0a0a0a]/80'
                  }`}
                >
                  <span className="float-left text-5xl sm:text-6xl font-bold leading-[0.85] mr-3 mt-1 text-[#fbbf24]">
                    {firstChar}
                  </span>
                  {restText}
                </p>
              </div>
            </div>
          );
        }

        // Every 3rd paragraph: extract a pull quote and show it ABOVE the paragraph
        const showPullQuote = paragraphCount > 1 && paragraphCount % 3 === 0;
        const pullQuote = showPullQuote ? extractPullQuote(text) : null;

        // Every 5th paragraph: show as a key insight card instead of plain text
        const showAsInsight = paragraphCount > 2 && paragraphCount % 5 === 0;

        if (showAsInsight) {
          const firstSentence = text.match(/^(.+?[.!?])\s/)?.[1];
          return (
            <div key={idx}>
              <InsightCard text={firstSentence || text.slice(0, 200)} />
              {text.length > (firstSentence?.length || 0) + 10 && (
                <p
                  className={`text-[15px] leading-[1.85] max-w-[62ch] ${
                    isDark ? 'text-white/60' : 'text-gray-600'
                  }`}
                >
                  {firstSentence ? text.slice(firstSentence.length).trim() : ''}
                </p>
              )}
            </div>
          );
        }

        // Detect inline numbered elements: "(1) Foo, (2) Bar, (3) Baz"
        const numbered = splitNumberedElements(text);
        if (numbered) {
          return (
            <div key={idx} className="my-6">
              {pullQuote && <PullQuote text={pullQuote} />}
              {numbered.lead && (
                <p
                  className={`text-[15px] leading-[1.85] max-w-[62ch] mb-5 ${
                    isDark ? 'text-white/70' : 'text-gray-700'
                  }`}
                >
                  <strong className={`font-semibold ${isDark ? 'text-white/85' : 'text-gray-800'}`}>
                    {numbered.lead}:
                  </strong>
                </p>
              )}
              <div className="space-y-3 pl-2">
                {numbered.items.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-4 rounded-xl p-4 ${
                      isDark
                        ? 'bg-white/[0.03] border-l-2 border-[#fbbf24]/30'
                        : 'bg-[#0a0a0a]/[0.02] border-l-2 border-[#fbbf24]/30'
                    }`}
                  >
                    <span className="flex-shrink-0 w-7 h-7 bg-[#fbbf24]/15 rounded-lg flex items-center justify-center mt-0.5">
                      <span className="text-[#fbbf24] text-[10px] font-bold">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <span
                      className={`text-[15px] leading-[1.7] ${
                        isDark ? 'text-white/70' : 'text-gray-700'
                      }`}
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        const [boldPart, rest] = splitFirstSentence(text);

        return (
          <div key={idx}>
            {pullQuote && <PullQuote text={pullQuote} />}
            <p
              className={`text-[15px] leading-[1.85] max-w-[62ch] ${
                isDark ? 'text-white/60' : 'text-gray-600'
              }`}
            >
              {boldPart ? (
                <>
                  <strong
                    className={`font-semibold ${
                      isDark ? 'text-white/80' : 'text-gray-800'
                    }`}
                  >
                    {boldPart}
                  </strong>{' '}
                  {rest}
                </>
              ) : (
                text
              )}
            </p>
          </div>
        );
      }

      case 'list': {
        paragraphCount = 0;
        const items = section.items || [];

        // Short lists (3-6 items, all under 80 chars) → connected step flow
        const isStepCandidate =
          items.length >= 3 &&
          items.length <= 6 &&
          items.every((item) => item.length < 80);

        if (isStepCandidate) {
          return (
            <div key={idx} className="my-10">
              {/* Horizontal step flow on desktop, vertical on mobile */}
              <div className="hidden sm:flex items-stretch gap-0">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center flex-1 min-w-0">
                    <div
                      className={`flex-1 rounded-xl p-4 text-center ${
                        isDark
                          ? 'bg-[#fbbf24]/[0.06] border border-[#fbbf24]/20'
                          : 'bg-[#fbbf24]/[0.04] border border-[#fbbf24]/15'
                      }`}
                    >
                      <span className="block text-[#fbbf24] text-xs font-bold mb-1">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`text-xs leading-snug ${
                          isDark ? 'text-white/80' : 'text-gray-700'
                        }`}
                      >
                        {item}
                      </span>
                    </div>
                    {i < items.length - 1 && (
                      <ArrowRight size={14} className="text-[#fbbf24]/40 mx-1 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
              {/* Mobile: vertical steps */}
              <div className="sm:hidden space-y-3">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-4 flex items-start gap-3 ${
                      isDark
                        ? 'bg-[#fbbf24]/[0.06] border border-[#fbbf24]/20'
                        : 'bg-[#fbbf24]/[0.04] border border-[#fbbf24]/15'
                    }`}
                  >
                    <span className="flex-shrink-0 w-7 h-7 bg-[#fbbf24]/15 rounded-lg flex items-center justify-center mt-0.5">
                      <span className="text-[#fbbf24] text-[10px] font-bold">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <span className={`leading-relaxed text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // Regular lists → numbered cards grid
        return (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-8">
            {items.map((item, i) => (
              <div
                key={i}
                className={`rounded-xl p-4 flex items-start gap-3 transition-all duration-200 ${
                  isDark
                    ? 'bg-white/[0.04] border border-white/10 hover:border-[#fbbf24]/30'
                    : 'bg-white border border-gray-200 hover:border-[#fbbf24]/40 hover:shadow-sm'
                }`}
              >
                <span className="flex-shrink-0 w-7 h-7 bg-[#fbbf24]/15 rounded-lg flex items-center justify-center mt-0.5">
                  <span className="text-[#fbbf24] text-[10px] font-bold">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </span>
                <span
                  className={`leading-relaxed text-sm ${
                    isDark ? 'text-white/75' : 'text-gray-700'
                  }`}
                >
                  {item}
                </span>
              </div>
            ))}
          </div>
        );
      }

      case 'image':
        paragraphCount = 0;
        return section.path ? (
          <div
            key={idx}
            className={`relative w-full h-56 sm:h-72 rounded-2xl overflow-hidden my-10 shadow-xl ${isDark ? 'bg-[#0a0a0a]' : 'bg-white'}`}
          >
            <Image
              src={section.path}
              alt={section.text || block.titulo}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          </div>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <section
      className={`relative overflow-hidden ${
        isDark ? 'bg-[#0a0a0a]' : 'bg-[#fafaf9]'
      } py-16 sm:py-24 px-4 sm:px-6 lg:px-8`}
    >
      <div
        className={`absolute top-0 ${imageOnLeft ? 'right-8' : 'left-8'} w-px h-20 ${
          isDark
            ? 'bg-gradient-to-b from-[#fbbf24]/30 to-transparent'
            : 'bg-gradient-to-b from-[#fbbf24]/20 to-transparent'
        } pointer-events-none`}
      />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-start">
          {/* Image column */}
          <div
            className={`lg:col-span-5 ${
              imageOnLeft ? 'lg:order-1' : 'lg:order-2'
            } order-2`}
          >
            <div className="lg:sticky lg:top-8 space-y-6">
              <div className={`relative h-64 sm:h-80 lg:h-[420px] rounded-2xl overflow-hidden shadow-xl group ${isDark ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
                <Image
                  src={illustration}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/40 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <div className="w-8 h-1 bg-[#fbbf24] rounded-full" />
                </div>
              </div>

              {/* Below-illustration sidebar content */}
              {(() => {
                // Extract a quote from the section's paragraphs
                const allText = sections
                  .filter((s) => s.type === 'paragraph')
                  .map((s) => s.text || '')
                  .join(' ');
                const sidebarQuote = extractPullQuote(allText);

                // Count list items across all lists
                const totalListItems = sections
                  .filter((s) => s.type === 'list')
                  .reduce((sum, s) => sum + (s.items?.length || 0), 0);

                return (
                  <>
                    {/* Section number — large decorative */}
                    <div className={`flex items-center gap-4 ${isDark ? '' : ''}`}>
                      <span className={`text-7xl font-bold leading-none ${isDark ? 'text-white/[0.04]' : 'text-[#0a0a0a]/[0.04]'}`}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className={`flex-1 h-px ${isDark ? 'bg-white/8' : 'bg-[#0a0a0a]/6'}`} />
                    </div>

                    {/* Quote card */}
                    {sidebarQuote && (
                      <div
                        className={`rounded-xl p-5 ${
                          isDark
                            ? 'bg-white/[0.03] border border-white/8'
                            : 'bg-white border border-gray-200'
                        }`}
                      >
                        <div className="text-[#fbbf24] text-2xl leading-none mb-3">&ldquo;</div>
                        <p
                          className={`text-sm leading-relaxed italic ${
                            isDark ? 'text-white/60' : 'text-gray-600'
                          }`}
                        >
                          {sidebarQuote.replace(/[.!?]+$/, '')}
                        </p>
                        <div className="w-6 h-0.5 bg-[#fbbf24] mt-4 rounded-full" />
                      </div>
                    )}

                    {/* Content count badge */}
                    {totalListItems > 0 && (
                      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                        isDark ? 'bg-white/[0.03]' : 'bg-[#0a0a0a]/[0.02]'
                      }`}>
                        <span className="text-2xl font-bold text-[#fbbf24]">{totalListItems}</span>
                        <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                          elementos clave en esta sección
                        </span>
                      </div>
                    )}

                    {/* Gallery images if any */}
                    {block.imagenes && block.imagenes.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {block.imagenes
                          .filter((img) => img.path)
                          .map((img) => (
                            <div
                              key={img.key}
                              className={`relative h-32 rounded-xl overflow-hidden shadow-lg group ${isDark ? 'bg-[#0a0a0a]' : 'bg-white'}`}
                            >
                              <Image
                                src={img.path}
                                alt={img.alt}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Content column */}
          <div
            className={`lg:col-span-7 ${
              imageOnLeft ? 'lg:order-2' : 'lg:order-1'
            } order-1`}
          >
            <div className="mb-10">
              <div className="w-10 h-1 bg-[#fbbf24] mb-5 rounded-full" />
              <h2
                className={`text-3xl sm:text-4xl font-bold leading-tight ${
                  isDark ? 'text-white' : 'text-[#0a0a0a]'
                }`}
              >
                {block.titulo}
              </h2>
            </div>

            <div className="space-y-6">
              {sections.map((section, idx) =>
                renderSection(section, idx, idx === firstParagraphIdx)
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
