/**
 * A6r r3 B2 — the shipped image manifest must match what is on disk.
 *
 * `/pasantias` used to ask the filesystem, per request, whether each of its four
 * photo slots and eight portraits existed. `public/` is not in a Vercel
 * function's file trace, so those probes can answer "missing" in production for
 * photographs that ship fine — the page renders correctly locally and
 * photo-less when deployed.
 *
 * Availability is now resolved at build time from
 * `lib/pasantias/image-manifest.ts`, which is generated and committed. A
 * generated file that nobody regenerates is worse than no file at all, so this
 * re-scans the directory and fails when the two disagree: adding a photograph
 * without running `npm run images:manifest` is a red test, not a silently
 * missing image.
 */
import { PASANTIAS_IMAGE_PATHS } from '../../lib/pasantias/image-manifest';
import { collectImagePaths } from '../../scripts/generate-pasantias-image-manifest.mjs';

describe('A6r [B2] — pasantías image manifest', () => {
  it('lists exactly the images under public/images/pasantias', () => {
    expect([...PASANTIAS_IMAGE_PATHS]).toEqual(collectImagePaths());
  });

  it('is sorted and free of duplicates, so its diffs stay readable', () => {
    const sorted = [...PASANTIAS_IMAGE_PATHS].sort();

    expect([...PASANTIAS_IMAGE_PATHS]).toEqual(sorted);
    expect(new Set(PASANTIAS_IMAGE_PATHS).size).toBe(PASANTIAS_IMAGE_PATHS.length);
  });

  it('holds public URL paths, never filesystem paths', () => {
    for (const path of PASANTIAS_IMAGE_PATHS) {
      expect(path).toMatch(/^\/images\/pasantias\/[\w/-]+\.(jpg|jpeg|png|webp)$/);
    }
  });
});
