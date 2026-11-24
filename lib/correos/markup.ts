/**
 * The text block's small plain-text markup. It is the only formatting a text body has; it is never HTML.
 *
 *   **bold**              bold
 *   [label](address)      a link (only `https:`, `http:` and `mailto:`; anything else keeps the label, drops the link)
 *   - item                a line beginning with "- " is a bullet
 *   (blank line)          a new paragraph; a single line break stays a line break
 *
 * Everything else is text. The parser returns a tree of plain values; the template draws it with React,
 * which escapes every character, so typed HTML comes out as visible text and never as markup.
 */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type BodyNode =
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'list'; items: Inline[][] };

// eslint-disable-next-line no-control-regex
const UNSAFE_URL_CHARACTER = /[\s\u0000-\u001f\u007f\\<>"']/;

/**
 * The address when it is safe to put in an email, else null. Only absolute `https:` and `http:` addresses
 * with a host, and (when `allowMailto`) `mailto:` addresses, are kept. `javascript:`, `data:`, relative
 * addresses and anything holding spaces, quotes or control characters are dropped.
 */
export function safeUrl(raw: unknown, options: { allowMailto?: boolean } = {}): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || UNSAFE_URL_CHARACTER.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
    return parsed.hostname ? parsed.href : null;
  }
  if (parsed.protocol === 'mailto:' && options.allowMailto) {
    return parsed.pathname.includes('@') ? parsed.href : null;
  }
  return null;
}

const BOLD = /\*\*([^*\n]+?)\*\*/;
const LINK = /\[([^\]\n]+)\]\(([^()\s]+)\)/;

function parseInline(source: string, allowBold: boolean, allowLink: boolean): Inline[] {
  const out: Inline[] = [];
  let rest = source;
  while (rest) {
    const bold = allowBold ? BOLD.exec(rest) : null;
    const link = allowLink ? LINK.exec(rest) : null;
    const next = bold && (!link || bold.index <= link.index) ? bold : link;
    if (!next) {
      out.push({ type: 'text', value: rest });
      break;
    }
    if (next.index > 0) out.push({ type: 'text', value: rest.slice(0, next.index) });
    if (next === bold) {
      out.push({ type: 'bold', children: parseInline(next[1], false, allowLink) });
    } else {
      const label = parseInline(next[1], allowBold, false);
      const href = safeUrl(next[2], { allowMailto: true });
      if (href) out.push({ type: 'link', href, children: label });
      else out.push(...label);
    }
    rest = rest.slice(next.index + next[0].length);
  }
  return out;
}

const BULLET = /^\s*- (.*)$/;

/** Parse a text body into paragraphs and bullet lists. */
export function parseBody(body: string): BodyNode[] {
  const nodes: BodyNode[] = [];
  const chunks = String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/);
  for (const chunk of chunks) {
    let current: BodyNode | null = null;
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      const bullet = BULLET.exec(line);
      if (bullet) {
        if (!current || current.type !== 'list') {
          current = { type: 'list', items: [] };
          nodes.push(current);
        }
        current.items.push(parseInline(bullet[1].trim(), true, true));
      } else {
        if (!current || current.type !== 'paragraph') {
          current = { type: 'paragraph', lines: [] };
          nodes.push(current);
        }
        current.lines.push(parseInline(line.trim(), true, true));
      }
    }
  }
  return nodes;
}

function inlineText(inline: Inline[]): string {
  return inline
    .map((part) => {
      if (part.type === 'text') return part.value;
      if (part.type === 'bold') return inlineText(part.children);
      const label = inlineText(part.children);
      const shown = part.href.startsWith('mailto:') ? part.href.slice('mailto:'.length) : part.href;
      return label === shown ? label : `${label} (${shown})`;
    })
    .join('');
}

/** The body as plain text, for the text version of the email. */
export function bodyToText(nodes: BodyNode[]): string {
  return nodes
    .map((node) =>
      node.type === 'paragraph'
        ? node.lines.map(inlineText).join('\n')
        : node.items.map((item) => `- ${inlineText(item)}`).join('\n')
    )
    .join('\n\n');
}
