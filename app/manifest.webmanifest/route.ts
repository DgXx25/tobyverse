const ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
];

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const manifest = {
    name: "TobyVerse",
    short_name: "TobyVerse",
    display: "standalone",
    start_url: `${origin}/`,
    scope: `${origin}/`,
    id: `${origin}/`,
    icons: ICONS,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
