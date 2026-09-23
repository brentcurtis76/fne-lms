import type JSZip from 'jszip';
import type { LicitacionDocumento } from '@/types/licitaciones';

export type PreviewKind = 'pdf' | 'image' | 'docx' | 'unsupported';
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
};

export function getPreviewType(doc: Pick<LicitacionDocumento, 'file_name' | 'mime_type'>): { kind: PreviewKind; mime: string } {
  const extension = doc.file_name?.split('.').pop()?.toLowerCase() || '';
  if (extension === 'pdf') return { kind: 'pdf', mime: 'application/pdf' };
  if (IMAGE_TYPES[extension]) return { kind: 'image', mime: IMAGE_TYPES[extension] };
  if (extension === 'docx') return { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  return { kind: 'unsupported', mime: '' };
}

// Render only text; never insert document-supplied HTML, links or remote images.
export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('El archivo Word no contiene un documento válido.');
  // Stream with a bound to avoid expanding a small ZIP into an unbounded XML string.
  const xml = await new Promise<string>((resolve, reject) => {
    let length = 0;
    const chunks: string[] = [];
    // JSZip exposes this browser streaming API but omits it from JSZipObject's types.
    const stream = (entry as typeof entry & { internalStream(type: 'string'): JSZip.JSZipStreamHelper<string> }).internalStream('string');
    stream.on('data', (chunk: string) => {
      length += chunk.length;
      if (length > 5 * 1024 * 1024) {
        stream.pause();
        reject(new Error('El contenido de Word es demasiado grande para la vista previa.'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(chunks.join('')));
    stream.resume();
  });
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('El archivo Word contiene XML no permitido.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('El archivo Word no es válido.');
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs = Array.from(document.getElementsByTagNameNS(namespace, 'p'));
  return paragraphs.map(paragraph => Array.from(paragraph.getElementsByTagNameNS(namespace, '*'))
    .map(node => node.localName === 't' ? node.textContent || ''
      : node.localName === 'tab' ? '\t' : ['br', 'cr'].includes(node.localName) ? '\n' : '').join('')).join('\n\n');
}
