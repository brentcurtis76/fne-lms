export type TipTapDoc = {
  type: string;
  content?: any[];
  text?: string;
  [key: string]: any;
};

const EMPTY_DOC: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

export const emptyDoc = (): TipTapDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] });

export const isEmptyDoc = (doc: any): boolean => {
  if (!doc || typeof doc !== 'object') return true;
  return plainTextFromDoc(doc).trim().length === 0;
};

export const plainTextFromDoc = (doc: any): string => {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;

  const blocks: string[] = [];

  const collectInline = (node: any): string => {
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map(collectInline).join('');
    }
    return '';
  };

  const walkBlock = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const blockTypes = new Set(['paragraph', 'heading', 'listItem', 'blockquote']);

    if (blockTypes.has(node.type)) {
      blocks.push(collectInline(node));
      return;
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walkBlock(child);
      }
    }
  };

  if (doc.type === 'doc' && Array.isArray(doc.content)) {
    for (const child of doc.content) {
      walkBlock(child);
    }
  } else {
    walkBlock(doc);
  }

  return blocks.join('\n');
};

export const richFromPlainText = (text?: string | null): TipTapDoc => {
  if (!text) return emptyDoc();
  const lines = text.split(/\r?\n/);
  const content = lines.map((line) =>
    line.length
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' }
  );
  return { type: 'doc', content };
};

export const docOrFromText = (doc: any, text?: string | null): TipTapDoc => {
  if (doc && typeof doc === 'object') return doc as TipTapDoc;
  return richFromPlainText(text);
};
