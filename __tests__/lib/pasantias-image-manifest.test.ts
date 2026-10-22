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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * PASANT-SCHOOL-SECTION-01 — the day section's still, a frame of the homepage
 * video, stored unmasked by Brent's direction
 * (`docs/plan/pasantias-school-section-20261022.md` §4). Two facts the record
 * relies on are read off the file itself: it is the frame's native 1280×720
 * (nothing upscaled), and the container carries no EXIF, XMP or ICC chunk, so
 * no source metadata travels with it.
 */
describe('PASANT-SCHOOL-SECTION-01 — the un-dia still', () => {
  const URL_PATH = '/images/pasantias/card-on-glass.webp';
  const FILE = join(__dirname, '..', '..', 'public', 'images', 'pasantias', 'card-on-glass.webp');

  /** The RIFF chunks of a WebP file, in order. */
  function webpChunks(bytes: Buffer): { id: string; data: Buffer }[] {
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');

    const chunks: { id: string; data: Buffer }[] = [];
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const id = bytes.toString('ascii', offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      chunks.push({ id, data: bytes.subarray(offset + 8, offset + 8 + size) });
      // Chunks are padded to an even length.
      offset += 8 + size + (size % 2);
    }
    return chunks;
  }

  it('is listed, so the page resolves it', () => {
    expect(PASANTIAS_IMAGE_PATHS).toContain(URL_PATH);
  });

  it('is a 1280×720 WebP with no metadata chunk', () => {
    const chunks = webpChunks(readFileSync(FILE));

    expect(chunks.map(({ id }) => id).filter((id) => ['EXIF', 'XMP ', 'ICCP'].includes(id))).toEqual([]);

    const extended = chunks.find(({ id }) => id === 'VP8X');
    if (extended) {
      // VP8X flags: ICC 0x20, EXIF 0x08, XMP 0x04 — none may be announced.
      expect(extended.data[0] & 0x2c).toBe(0);
      expect([1 + extended.data.readUIntLE(4, 3), 1 + extended.data.readUIntLE(7, 3)]).toEqual([1280, 720]);
      return;
    }

    // A simple lossy file: one VP8 key frame, whose header carries the size.
    const frame = chunks.find(({ id }) => id === 'VP8 ');
    expect(frame).toBeDefined();
    expect([...(frame as { data: Buffer }).data.subarray(3, 6)]).toEqual([0x9d, 0x01, 0x2a]);
    expect([
      (frame as { data: Buffer }).data.readUInt16LE(6) & 0x3fff,
      (frame as { data: Buffer }).data.readUInt16LE(8) & 0x3fff,
    ]).toEqual([1280, 720]);
  });
});
