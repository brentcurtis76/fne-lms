/**
 * Checks on an email's content before it is drawn or sent. Each problem is one plain message, in Spanish,
 * naming the block by its place (1 is the first). An empty list means the content is fine.
 */
import { safeUrl } from './markup';
import type { Block, EmailContent } from './types';

export const MAX_BLOCKS = 50;

const KIND_NAME: Record<Block['kind'], string> = {
  text: 'texto',
  picture: 'imagen',
  button: 'botón',
};

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateBlocks(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return ['El correo no tiene bloques.'];
  if (blocks.length === 0) return ['El correo necesita al menos un bloque.'];
  const errors: string[] = [];
  if (blocks.length > MAX_BLOCKS) errors.push(`El correo tiene más de ${MAX_BLOCKS} bloques.`);

  blocks.forEach((raw, index) => {
    const place = index + 1;
    const block = raw as Partial<Block> | null;
    const kind = block && typeof block === 'object' ? block.kind : undefined;
    if (kind !== 'text' && kind !== 'picture' && kind !== 'button') {
      errors.push(`El bloque ${place} no es de texto, imagen ni botón.`);
      return;
    }
    const name = `El bloque ${place} (${KIND_NAME[kind]})`;
    if (kind === 'text') {
      const text = block as Partial<Extract<Block, { kind: 'text' }>>;
      if (text.title !== undefined && typeof text.title !== 'string') errors.push(`${name} tiene un título que no es texto.`);
      if (!filled(text.body)) errors.push(`${name} no tiene texto.`);
    } else if (kind === 'picture') {
      const picture = block as Partial<Extract<Block, { kind: 'picture' }>>;
      if (!safeUrl(picture.url)) errors.push(`${name} necesita una dirección de imagen que empiece con https:// o http://.`);
      if (!filled(picture.description)) errors.push(`${name} necesita una descripción de la imagen.`);
      if (picture.link !== undefined && picture.link !== '' && !safeUrl(picture.link, { allowMailto: true })) {
        errors.push(`${name} tiene un enlace que no empieza con https://, http:// o mailto:.`);
      }
    } else {
      const button = block as Partial<Extract<Block, { kind: 'button' }>>;
      if (!filled(button.label)) errors.push(`${name} necesita un texto para el botón.`);
      if (!safeUrl(button.link, { allowMailto: true })) {
        errors.push(`${name} necesita un enlace que empiece con https://, http:// o mailto:.`);
      }
    }
  });
  return errors;
}

export function validateContent(content: unknown): string[] {
  const value = content as Partial<EmailContent> | null;
  if (!value || typeof value !== 'object') return ['No hay correo.'];
  const errors: string[] = [];
  if (!filled(value.subject)) errors.push('El correo necesita un asunto.');
  if (value.previewLine !== undefined && typeof value.previewLine !== 'string') {
    errors.push('La línea de vista previa no es texto.');
  }
  return errors.concat(validateBlocks(value.blocks));
}
