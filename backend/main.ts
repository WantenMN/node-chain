import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import open from "open";
import { serveStatic } from "./static.ts";
import { setupWebSocket } from "./ws.ts";

const PORT = 8080;

// ── Auto-build frontend ─────────────────────────────────────────────────────
async function ensureFrontendBuilt() {
  const distDir = join(import.meta.dirname!, "..", "dist");
  if (existsSync(distDir) && existsSync(join(distDir, "index.html"))) {
    console.log("✅ Frontend dist found, skipping build");
    return;
  }
  console.log("🔨 Frontend not built, compiling...");
  const cmd = new Deno.Command("deno", {
    args: ["task", "build"],
    cwd: join(import.meta.dirname!, ".."),
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success } = await cmd.output();
  console.log(success ? "✅ Frontend built" : "❌ Frontend build failed");
}

// ── HTTP Server ─────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  if (url.pathname === "/ws") return;
  try {
    serveStatic(res, url.pathname);
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

// ── WebSocket Server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws" });
setupWebSocket(wss);

// ── Start ───────────────────────────────────────────────────────────────────
await ensureFrontendBuilt();
server.listen(PORT, async () => {
  console.log(`🚀 Server at http://localhost:${PORT}`);
  if (!Deno.args.includes("--dev")) await open(`http://localhost:${PORT}`);
});
