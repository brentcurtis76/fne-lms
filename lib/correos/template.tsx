/**
 * The one base template: a brand and an email's content in, the HTML and a plain-text version out.
 *
 * Email clients are not browsers, so the look follows their rules: every style is inline on its element
 * (no `<style>` rule carries the look), sizes are in pixels (never `rem`), there is no stylesheet link, no
 * script and no web font, the preview line is hidden in the body, the width is 600 px and shrinks on a
 * phone, pictures carry `alt`, a fixed maximum width and `height:auto`, and the button is React Email's
 * padded link, which carries Outlook's own padding hints.
 *
 * Everything a reader sees that belongs to a client comes from the brand: logo, accent colour and the text
 * colour on it, the neutral colours (text, muted text, page and sheet backgrounds, the rule), font stack,
 * legal footer, language. The template holds no colour of its own.
 */
import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';
import { bodyToText, parseBody, safeUrl, type Inline } from './markup';
import type { Block, Brand, EmailContent, ListLinks, RenderedEmail } from './types';

export const EMAIL_WIDTH = 600;
const GUTTER = 24;
export const CONTENT_WIDTH = EMAIL_WIDTH - GUTTER * 2;

/** The kit's only own words: the labels of the release-2 list links, by language. */
const LIST_LINK_WORDS: Record<string, { unsubscribe: string; preferences: string }> = {
  es: { unsubscribe: 'Darse de baja', preferences: 'Preferencias de correo' },
  en: { unsubscribe: 'Unsubscribe', preferences: 'Email preferences' },
};

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Plain messages for a brand that cannot be drawn; empty when it is fine. */
export function validateBrand(brand: Brand): string[] {
  const errors: string[] = [];
  if (!brand || typeof brand !== 'object') return ['No hay marca.'];
  if (!brand.name?.trim()) errors.push('La marca no tiene nombre.');
  if (!safeUrl(brand.logo?.url)) errors.push('El logo de la marca necesita una dirección https:// o http:// completa.');
  if (!brand.logo?.description?.trim()) errors.push('El logo de la marca necesita una descripción.');
  if (!(brand.logo?.width > 0) || !(brand.logo?.height > 0)) errors.push('El logo de la marca necesita ancho y alto.');
  if (!COLOR.test(brand.accentColor ?? '')) errors.push('El color de acento de la marca debe ser #rrggbb.');
  if (!COLOR.test(brand.onAccentColor ?? '')) errors.push('El color del texto sobre el acento debe ser #rrggbb.');
  if (!COLOR.test(brand.textColor ?? '')) errors.push('El color del texto de la marca debe ser #rrggbb.');
  if (!COLOR.test(brand.mutedTextColor ?? '')) errors.push('El color del texto secundario de la marca debe ser #rrggbb.');
  if (!COLOR.test(brand.pageBackgroundColor ?? '')) errors.push('El color de fondo de la página debe ser #rrggbb.');
  if (!COLOR.test(brand.sheetBackgroundColor ?? '')) errors.push('El color de fondo de la hoja debe ser #rrggbb.');
  if (!COLOR.test(brand.ruleColor ?? '')) errors.push('El color de la línea divisoria debe ser #rrggbb.');
  if (!brand.fontStack?.trim()) errors.push('La marca no tiene tipografía.');
  if (!Array.isArray(brand.footerLines) || brand.footerLines.length === 0) errors.push('La marca no tiene pie legal.');
  if (!brand.language?.trim()) errors.push('La marca no tiene idioma.');
  return errors;
}

function listLinkWords(language: string) {
  const base = language.toLowerCase().split('-')[0];
  return LIST_LINK_WORDS[base] ?? LIST_LINK_WORDS.en;
}

function InlineParts({ parts, linkColor }: { parts: Inline[]; linkColor: string }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'text') return <React.Fragment key={index}>{part.value}</React.Fragment>;
        if (part.type === 'bold') {
          return (
            <strong key={index} style={{ fontWeight: 700 }}>
              <InlineParts parts={part.children} linkColor={linkColor} />
            </strong>
          );
        }
        return (
          <Link key={index} href={part.href} style={{ color: linkColor, textDecoration: 'underline' }}>
            <InlineParts parts={part.children} linkColor={linkColor} />
          </Link>
        );
      })}
    </>
  );
}

function TextBlockView({ title, body, font, color }: { title?: string; body: string; font: string; color: string }) {
  const text = { fontFamily: font, fontSize: '16px', lineHeight: '24px', color };
  return (
    <Section style={{ padding: '0 0 8px 0' }} data-block="text">
      {title?.trim() ? (
        <Heading as="h2" style={{ ...text, fontSize: '20px', lineHeight: '28px', fontWeight: 700, margin: '0 0 8px 0' }}>
          {title.trim()}
        </Heading>
      ) : null}
      {parseBody(body).map((node, index) =>
        node.type === 'paragraph' ? (
          <Text key={index} style={{ ...text, margin: '0 0 16px 0' }}>
            {node.lines.map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                <InlineParts parts={line} linkColor={color} />
              </React.Fragment>
            ))}
          </Text>
        ) : (
          <ul key={index} style={{ ...text, margin: '0 0 16px 0', padding: '0 0 0 24px' }}>
            {node.items.map((item, itemIndex) => (
              <li key={itemIndex} style={{ ...text, margin: '0 0 4px 0' }}>
                <InlineParts parts={item} linkColor={color} />
              </li>
            ))}
          </ul>
        )
      )}
    </Section>
  );
}

function PictureBlockView({ url, description, link }: { url: string; description: string; link?: string }) {
  const src = safeUrl(url);
  if (!src) return null;
  const href = link ? safeUrl(link, { allowMailto: true }) : null;
  const picture = (
    <Img
      src={src}
      alt={description}
      width={CONTENT_WIDTH}
      style={{ display: 'block', width: '100%', maxWidth: `${CONTENT_WIDTH}px`, height: 'auto', border: '0' }}
    />
  );
  return (
    <Section style={{ padding: '0 0 24px 0' }} data-block="picture">
      {href ? <Link href={href}>{picture}</Link> : picture}
    </Section>
  );
}

function ButtonBlockView({ label, link, brand }: { label: string; link: string; brand: Brand }) {
  const href = safeUrl(link, { allowMailto: true });
  if (!href || !label?.trim()) return null;
  return (
    <Section style={{ padding: '0 0 24px 0' }} data-block="button">
      <Button
        href={href}
        style={{
          backgroundColor: brand.accentColor,
          color: brand.onAccentColor,
          fontFamily: brand.fontStack,
          fontSize: '16px',
          lineHeight: '24px',
          fontWeight: 700,
          textDecoration: 'none',
          borderRadius: '6px',
          padding: '12px 24px',
        }}
      >
        {label.trim()}
      </Button>
    </Section>
  );
}

function BlockView({ block, brand }: { block: Block; brand: Brand }) {
  if (block.kind === 'text') return <TextBlockView title={block.title} body={block.body} font={brand.fontStack} color={brand.textColor} />;
  if (block.kind === 'picture') return <PictureBlockView url={block.url} description={block.description} link={block.link} />;
  if (block.kind === 'button') return <ButtonBlockView label={block.label} link={block.link} brand={brand} />;
  return null;
}

export function EmailDocument({ brand, content, links = {} }: { brand: Brand; content: EmailContent; links?: ListLinks }) {
  const font = brand.fontStack;
  const small = { fontFamily: font, fontSize: '13px', lineHeight: '20px', color: brand.mutedTextColor, margin: '0 0 4px 0' };
  const unsubscribe = links.unsubscribeUrl ? safeUrl(links.unsubscribeUrl) : null;
  const preferences = links.preferencesUrl ? safeUrl(links.preferencesUrl) : null;
  const words = listLinkWords(brand.language);
  return (
    <Html lang={brand.language} dir="ltr">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{content.subject}</title>
      </Head>
      {content.previewLine ? <Preview>{content.previewLine}</Preview> : null}
      <Body style={{ margin: '0', padding: '24px 0', backgroundColor: brand.pageBackgroundColor, fontFamily: font, color: brand.textColor }}>
        <Container
          style={{
            width: '100%',
            maxWidth: `${EMAIL_WIDTH}px`,
            margin: '0 auto',
            backgroundColor: brand.sheetBackgroundColor,
            borderTop: `4px solid ${brand.accentColor}`,
          }}
        >
          <Section style={{ padding: `24px ${GUTTER}px 16px ${GUTTER}px` }} data-part="logo">
            <Img
              src={safeUrl(brand.logo.url) ?? undefined}
              alt={brand.logo.description || brand.name}
              width={brand.logo.width}
              height={brand.logo.height}
              style={{ display: 'block', maxWidth: '100%', height: 'auto', border: '0' }}
            />
          </Section>
          <Section style={{ padding: `8px ${GUTTER}px 8px ${GUTTER}px` }} data-part="blocks">
            {content.blocks.map((block, index) => (
              <BlockView key={index} block={block} brand={brand} />
            ))}
          </Section>
          <Section style={{ padding: `16px ${GUTTER}px 24px ${GUTTER}px`, borderTop: `1px solid ${brand.ruleColor}` }} data-part="footer">
            {brand.footerLines.map((line, index) => (
              <Text key={index} style={small}>
                {line}
              </Text>
            ))}
            {/*
              RELEASE 2 SLOT: the unsubscribe and preferences links. Drawn only when given; absent, nothing
              appears here. Release 2 passes them (and the matching List-Unsubscribe headers) per recipient.
            */}
            {unsubscribe || preferences ? (
              <Text style={{ ...small, margin: '12px 0 0 0' }} data-part="list-links">
                {unsubscribe ? (
                  <Link href={unsubscribe} style={{ color: brand.mutedTextColor, textDecoration: 'underline' }}>
                    {words.unsubscribe}
                  </Link>
                ) : null}
                {unsubscribe && preferences ? ' · ' : null}
                {preferences ? (
                  <Link href={preferences} style={{ color: brand.mutedTextColor, textDecoration: 'underline' }}>
                    {words.preferences}
                  </Link>
                ) : null}
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function blockToText(block: Block): string {
  if (block.kind === 'text') {
    const body = bodyToText(parseBody(block.body));
    return block.title?.trim() ? `${block.title.trim()}\n\n${body}` : body;
  }
  if (block.kind === 'picture') {
    if (!safeUrl(block.url)) return '';
    const href = block.link ? safeUrl(block.link, { allowMailto: true }) : null;
    return href ? `[${block.description}] ${href}` : `[${block.description}]`;
  }
  if (block.kind === 'button') {
    const href = safeUrl(block.link, { allowMailto: true });
    return href && block.label?.trim() ? `${block.label.trim()}: ${href}` : '';
  }
  return '';
}

/** The plain-text version: the blocks in order, then the footer and (when given) the list links. */
export function renderText(brand: Brand, content: EmailContent, links: ListLinks = {}): string {
  const parts = content.blocks.map(blockToText).filter(Boolean);
  const footer = [...brand.footerLines];
  const words = listLinkWords(brand.language);
  const unsubscribe = links.unsubscribeUrl ? safeUrl(links.unsubscribeUrl) : null;
  const preferences = links.preferencesUrl ? safeUrl(links.preferencesUrl) : null;
  if (unsubscribe) footer.push(`${words.unsubscribe}: ${unsubscribe}`);
  if (preferences) footer.push(`${words.preferences}: ${preferences}`);
  return `${parts.join('\n\n')}\n\n--\n${footer.join('\n')}\n`;
}

/** Draw one email in one brand. Throws when the brand itself cannot be drawn (a host's mistake). */
export async function renderEmail(brand: Brand, content: EmailContent, links: ListLinks = {}): Promise<RenderedEmail> {
  const brandErrors = validateBrand(brand);
  if (brandErrors.length) throw new Error(`Marca no válida: ${brandErrors.join(' ')}`);
  const html = await render(<EmailDocument brand={brand} content={content} links={links} />);
  return { subject: content.subject, html, text: renderText(brand, content, links) };
}
