/**
 * Joins class lists, dropping empty parts. On purpose it does NOT merge or drop conflicting classes (no
 * tailwind-merge): a piece's classes come in a fixed order and a caller's `className` is added at the end,
 * so what an element carries is always readable from the code.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
