import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);

const staticFiles = {
  "/manifest.webmanifest": {
    file: "manifest.webmanifest",
    type: "application/manifest+json",
  },
  "/service-worker.js": {
    file: "service-worker.js",
    type: "text/javascript; charset=utf-8",
  },
  "/favicon.svg": {
    file: "favicon.svg",
    type: "image/svg+xml",
  },
  "/icons/icon.svg": {
    file: "icons/icon.svg",
    type: "image/svg+xml",
  },
  "/icons/icon-192.png": {
    file: "icons/icon-192.png",
    type: "image/png",
  },
  "/icons/icon-512.png": {
    file: "icons/icon-512.png",
    type: "image/png",
  },
} as const;

Bun.serve({
  port,
  routes: {
    "/": index,
    "/index.html": index,
    "/*": (request) => {
      const pathname = new URL(request.url).pathname;
      const asset = staticFiles[pathname as keyof typeof staticFiles];

      if (asset) {
        return new Response(Bun.file(asset.file), {
          headers: {
            "content-type": asset.type,
            "cache-control": pathname === "/service-worker.js" ? "no-cache" : "public, max-age=3600",
          },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`web-authenticator running at http://localhost:${port}`);
