import { resolveDisplayUrl } from '@/lib/propuestas/storage';
import type { ProposalSnapshot } from './snapshot';

/**
 * Resolve all storage paths in a snapshot to signed URLs.
 * Call this at serve-time, not at build-time, so URLs are always fresh.
 */
export async function resolveSnapshotUrls(snapshot: ProposalSnapshot): Promise<ProposalSnapshot> {
  const consultants = await Promise.all(
    snapshot.consultants.map(async (c) => ({
      ...c,
      fotoPath: await resolveDisplayUrl(c.fotoPath),
    }))
  );

  const contentBlocks = await Promise.all(
    snapshot.contentBlocks.map(async (block) => {
      const resolvedImagenes = block.imagenes
        ? await Promise.all(
            block.imagenes.map(async (img) => ({
              ...img,
              path: await resolveDisplayUrl(img.path),
            }))
          )
        : null;

      const resolvedSections = await Promise.all(
        block.contenido.sections.map(async (section) => {
          if (section.type === 'image' && section.path) {
            return { ...section, path: (await resolveDisplayUrl(section.path)) ?? null };
          }
          return section;
        })
      );

      return {
        ...block,
        imagenes: resolvedImagenes,
        contenido: { sections: resolvedSections },
      };
    })
  );

  const schoolLogoPath = await resolveDisplayUrl(snapshot.schoolLogoPath ?? null);

  return {
    ...snapshot,
    consultants,
    contentBlocks,
    ...(snapshot.schoolLogoPath !== undefined ? { schoolLogoPath } : {}),
  };
}
