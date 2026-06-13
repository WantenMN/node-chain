import { join, extname } from "@std/path";

const FRONTEND_DIST = join(import.meta.dirname!, "..", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

export function serveStatic(pathname: string): Response {
  let filePath = join(FRONTEND_DIST, pathname);
  if (existsSync(filePath) && Deno.statSync(filePath).isDirectory) {
    filePath = join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    filePath = join(FRONTEND_DIST, "index.html");
  }
  const ext = extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";
  return new Response(Deno.readFileSync(filePath), {
    headers: { "Content-Type": mime },
  });
}
