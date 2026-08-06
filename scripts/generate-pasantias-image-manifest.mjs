#!/usr/bin/env node
/**
 * Regenerates `lib/pasantias/image-manifest.ts` from what is actually on disk
 * under `public/images/pasantias/`.
 *
 * Why a generated file rather than a runtime probe: Vercel bundles a function's
 * runtime files from the build's file trace, and `public/` is served separately
 * and is not in that trace. A page that asks the filesystem "does this photo
 * exist?" while serving a request therefore gets "no" in production for files
 * that plainly exist — it renders correctly here and photo-less when deployed.
 * The availability of a static asset is a build-time fact, so it is resolved at
 * build time and shipped as code.
 *
 * The manifest is committed. `__tests__/lib/pasantias-image-manifest.test.ts`
 * re-scans the directory and fails if the two disagree, so adding a photograph
 * without re-running this is a red test rather than a silently missing image.
 *
 *   node scripts/generate-pasantias-image-manifest.mjs
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(REPO_ROOT, 'public');
const IMAGES_DIR = join(PUBLIC_DIR, 'images', 'pasantias');
const MANIFEST_PATH = join(REPO_ROOT, 'lib', 'pasantias', 'image-manifest.ts');

/** Extensions the page is willing to serve as a photograph. */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Every image under `directory`, as a public URL path (`/images/...`), sorted so
 * the generated file is stable and its diffs are readable.
 */
export function collectImagePaths(directory = IMAGES_DIR) {
  const found = [];

  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const extension = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(extension)) continue;
      found.push(`/${posix.join(...relative(PUBLIC_DIR, absolute).split(/[\\/]/))}`);
    }
  };

  walk(directory);
  return found.sort();
}

export function renderManifest(paths) {
  return `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`npm run images:manifest\` after adding or removing a photograph under
 * \`public/images/pasantias/\`.
 *
 * Every image that ships with \`/pasantias\`, as a public URL path. The page
 * resolves its photo slots and portraits against this list at module scope, so
 * no request ever asks the filesystem whether a static asset exists —
 * \`public/\` is not in a Vercel function's file trace, and a runtime probe
 * there answers "missing" for files that ship fine.
 *
 * \`__tests__/lib/pasantias-image-manifest.test.ts\` fails when this list and the
 * directory disagree.
 */
export const PASANTIAS_IMAGE_PATHS: readonly string[] = [
${paths.map((path) => `  '${path}',`).join('\n')}
];
`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const paths = collectImagePaths();
  writeFileSync(MANIFEST_PATH, renderManifest(paths), 'utf8');
  console.log(`Wrote ${relative(REPO_ROOT, MANIFEST_PATH)} — ${paths.length} images.`);
}
