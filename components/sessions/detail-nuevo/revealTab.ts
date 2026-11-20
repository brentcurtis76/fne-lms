/**
 * Send-back B9, point 2: on a phone the session page's tab row is wider than the screen and scrolls
 * sideways. The tab that gets the focus, or becomes the chosen one, is brought fully into view inside
 * that row: only the row's own sideways scroll moves (never the page, never up or down), by the least
 * amount that shows the whole tab with a small edge to spare, so the keyboard's focus mark around it
 * is not cut by the row's edges either. A tab already fully in view leaves the row where it is.
 */

/** The room kept between a revealed tab and the row's edge, in pixels. */
export const REVEAL_EDGE_PX = 8;

export function revealTabInRow(row: HTMLElement, tab: HTMLElement): void {
  const rowBox = row.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  // A tab nearly as wide as the row gets less room (never a negative one), and its start wins.
  const edge = Math.max(0, Math.min(REVEAL_EDGE_PX, (rowBox.width - tabBox.width) / 2));
  const before = rowBox.left + edge - tabBox.left;
  const after = tabBox.right - (rowBox.right - edge);
  if (before > 0) row.scrollLeft -= before;
  else if (after > 0) row.scrollLeft += after;
}

/** The row around a tab (its `role="tablist"` ancestor), or null. */
export function rowOf(tab: Element): HTMLElement | null {
  return tab.closest<HTMLElement>('[role="tablist"]');
}
