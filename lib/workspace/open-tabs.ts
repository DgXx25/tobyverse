export const MAX_OPEN_NOTEBOOKS = 3;

/** Append a newly opened notebook and keep the open-tab list within its limit. */
export function addOpenNotebook(ids: string[], id: string, limit = MAX_OPEN_NOTEBOOKS): string[] {
  if (ids.includes(id)) return ids;
  return [...ids, id].slice(-Math.max(1, limit));
}
