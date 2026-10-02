/** Axis label for a path name: at most 28 characters, ending in "…" when shortened. */
export function shortPathLabel(name: unknown): string {
  const text = String(name ?? '');
  return text.length > 28 ? `${text.slice(0, 27).trimEnd()}…` : text;
}
