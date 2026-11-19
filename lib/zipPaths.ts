/**
 * Unique entry paths inside a ZIP (GENERA fixes F20, LIC-D7).
 *
 * Copied from uniquifyZipPath in pages/api/propuestas/web/[slug]/download-zip.ts
 * (that route keeps its own copy, unchanged), with the suffix the tender ZIP
 * uses: a second «Propuesta.pdf» in the same folder becomes «Propuesta (2).pdf»,
 * a third «Propuesta (3).pdf».
 */

import path from 'path';

export function uniquifyZipPath(zipPath: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(zipPath)) {
    usedPaths.add(zipPath);
    return zipPath;
  }

  const directory = path.posix.dirname(zipPath);
  const parsed = path.posix.parse(path.posix.basename(zipPath));
  let counter = 2;
  let candidate = '';

  do {
    candidate = path.posix.join(directory, `${parsed.name} (${counter})${parsed.ext}`);
    counter += 1;
  } while (usedPaths.has(candidate));

  usedPaths.add(candidate);
  return candidate;
}
