import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

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

export function serveStatic(res: any, pathname: string) {
  let filePath = join(FRONTEND_DIST, pathname);
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    filePath = join(FRONTEND_DIST, "index.html");
  }
  const ext = extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  res.end(readFileSync(filePath));
}
