/** Returns the notebook represented by a notebook/chat route, or null elsewhere. */
export function activeNotebookId(pathname: string): string | null {
  const match = pathname.match(/^\/(?:p|c)\/([^/]+)(?:\/|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
