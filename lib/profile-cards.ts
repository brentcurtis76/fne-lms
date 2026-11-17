/**
 * Other people's names for Espacio Colaborativo (GENERA fixes F11, EC-S5).
 *
 * The rules on `profiles` let a person read only their own row (admins all),
 * so embedding `profiles` for authors, commenters or reactors leaves other
 * people's names blank. Names come instead from the database function
 * `get_profile_cards(p_ids uuid[])` (migration 20261116179000), which returns
 * id, first_name, last_name and avatar_url — nothing else — only for people
 * the caller may know, and looks at most at 200 ids per call.
 */

export interface ProfileCard {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

/** The most ids the function looks at in one call. */
export const PROFILE_CARDS_MAX_IDS = 200;

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * The cards of the given people, by id. Empty, null and repeated ids are
 * dropped; more than 200 ids are asked in several calls. A failed call leaves
 * those people out (their names fall back to the screen's default).
 */
export async function fetchProfileCards(
  client: RpcClient,
  ids: Iterable<string | null | undefined>
): Promise<Map<string, ProfileCard>> {
  const unique = Array.from(new Set(Array.from(ids).filter((id): id is string => typeof id === 'string' && id.length > 0)));
  const cards = new Map<string, ProfileCard>();
  for (let start = 0; start < unique.length; start += PROFILE_CARDS_MAX_IDS) {
    const chunk = unique.slice(start, start + PROFILE_CARDS_MAX_IDS);
    const { data, error } = await client.rpc('get_profile_cards', { p_ids: chunk });
    if (error) {
      console.error('[profile-cards] get_profile_cards failed');
      continue;
    }
    for (const row of (Array.isArray(data) ? data : []) as ProfileCard[]) {
      if (row && typeof row.id === 'string') {
        cards.set(row.id, {
          id: row.id,
          first_name: row.first_name ?? null,
          last_name: row.last_name ?? null,
          avatar_url: row.avatar_url ?? null,
        });
      }
    }
  }
  return cards;
}

/** «First Last» when both names are known, otherwise the fallback. */
export function cardName(card: ProfileCard | null | undefined, fallback = 'Usuario'): string {
  return card?.first_name && card?.last_name ? `${card.first_name} ${card.last_name}` : fallback;
}
