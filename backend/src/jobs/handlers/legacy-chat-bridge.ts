type LegacyChatRoute = { POST(request: Request): Promise<Response> };

export type LegacyChatRouteLoader = () => Promise<LegacyChatRoute>;

/**
 * Loads the existing Next route only when a background chat job runs. Keeping
 * the import behind a computed URL prevents the backend TypeScript build from
 * pulling the Next/UI dependency graph into the separate service build.
 */
export function createLegacyChatInvoker(
  loadRoute: LegacyChatRouteLoader = async () => {
    const routeUrl = new URL("../../../../app/api/chat/route.ts", import.meta.url);
    return await import(routeUrl.href) as LegacyChatRoute;
  },
) {
  return async (request: Request) => (await loadRoute()).POST(request);
}

export const invokeLegacyChat = createLegacyChatInvoker();
