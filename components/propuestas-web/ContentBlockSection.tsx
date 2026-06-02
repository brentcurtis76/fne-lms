import Image from 'next/image';
import type { SnapshotContentBlock } from '@/lib/propuestas-web/snapshot';
import { normalizeText, significantWords } from '@/lib/propuestas-web/text-utils';

/* ──────────────────────────── image mapping ──────────────────────────── */

const TITLE_IMAGE_MAP: Array<{ match: string; src: string }> = [
  { match: 'Estadías INSPIRA', src: '/images/barcelona-skyline-photo.png' },
  { match: 'Barcelona', src: '/images/barcelona-skyline-photo.png' },
  { match: 'Sagrada Familia', src: '/images/sagrada-familia-photo.png' },
];

function getImageForBlock(title: string): string | null {
  const entry = TITLE_IMAGE_MAP.find((e) =>
    title.toLowerCase().includes(e.match.toLowerCase())
  );
  return entry?.src ?? null;
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
  sectionId?: string;
}

export default function ContentBlockSection({ block, variant, index, sectionId }: ContentBlockSectionProps) {
  const isDark = variant === 'dark';
  const editorialPlate = getImageForBlock(block.titulo);

  const sections = block.contenido.sections;
  const firstParagraphIdx = sections.findIndex((s) => s.type === 'paragraph');

  const titleNorm = normalizeText(block.titulo);

  let paragraphCount = 0;

  /* ─── pull quote component ─── */
  const PullQuote = ({ text }: { text: string }) => (
    <blockquote className="pw-pullquote">
      <p>
        &ldquo;{text.replace(/[.!?]+$/, '')}&rdquo;
      </p>
    </blockquote>
  );

  /* ─── key insight card ─── */
  const InsightCard = ({ text }: { text: string }) => (
    <div className="pw-num-list__item">
      <span className="pw-num-list__num">
        00
      </span>
      <p>
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
        const headingNorm = normalizeText(section.text || '');

        // Skip headings that are redundant with the block title.
        // Uses word-overlap: if >50% of content words match, it's redundant.
        const titleWords = significantWords(titleNorm);
        const headingWords = significantWords(headingNorm);
        const titleSet = new Set(titleWords);
        const overlap = headingWords.filter(w => titleSet.has(w)).length;
        const denominator = Math.max(titleWords.length, headingWords.length);
        const isRedundant =
          headingNorm === titleNorm ||
          titleNorm.includes(headingNorm) ||
          headingNorm.includes(titleNorm) ||
          (denominator > 0 && overlap / denominator >= 0.5);
        if (isRedundant) return null;

        return (
          <div key={idx} className="pw-article__heading">
            <h3 className={section.level === 3 ? 'text-xl font-black' : 'pw-h3'}>
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
            <p key={idx} className="pw-lede pw-dropcap">
              {firstChar}
              {restText}
            </p>
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
                <p>
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
            <div key={idx}>
              {pullQuote && <PullQuote text={pullQuote} />}
              {numbered.lead && (
                <p>
                  <strong>
                    {numbered.lead}:
                  </strong>
                </p>
              )}
              <div className="pw-num-list">
                {numbered.items.map((item, i) => (
                  <div key={i} className="pw-num-list__item">
                    <span className="pw-num-list__num">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>
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
            <p>
              {boldPart ? (
                <>
                  <strong>
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
            <div key={idx} className="pw-step-list">
              <div className="grid gap-3 sm:grid-cols-3">
                {items.map((item, i) => (
                  <div key={i} className="pw-step-list__item">
                      <span className="pw-num-list__num">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>
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
          <div key={idx} className="pw-num-list">
            {items.map((item, i) => (
              <div key={i} className="pw-num-list__item">
                <span className="pw-num-list__num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>
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
          <div key={idx} className="pw-article__image">
            <Image
              src={section.path}
              alt={section.text || block.titulo}
              fill
              className="object-cover"
            />
          </div>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <section
      id={sectionId}
      className={`pw-section ${isDark ? 'pw-section--dark' : 'pw-section--cream'}`}
    >
      <div className="pw-wrap">
        <div className="pw-article">
          <aside>
            <p className="pw-kicker mb-6">
              {String(index + 1).padStart(2, '0')}
            </p>
            {editorialPlate && (
              <div className="pw-article__plate">
                <Image src={editorialPlate} alt="" fill sizes="(min-width: 760px) 38vw, 100vw" />
              </div>
            )}
          </aside>

          <div className="pw-article__content">
            <div className="mb-10">
              <h2 className="pw-h2">
                {block.titulo}
              </h2>
            </div>

            <div className="pw-article__body">
              {sections.map((section, idx) =>
                renderSection(section, idx, idx === firstParagraphIdx)
              )}

              {block.imagenes && block.imagenes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {block.imagenes
                    .filter((img) => img.path)
                    .map((img) => (
                      <div key={img.key} className="pw-article__image">
                        <Image src={img.path} alt={img.alt} fill className="object-cover" />
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
