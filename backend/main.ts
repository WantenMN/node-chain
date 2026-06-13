import { join } from "@std/path";
import open from "open";
import { serveStatic } from "./static.ts";
import { handleWebSocket } from "./ws.ts";

const PORT = 8080;

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

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

// ── Start ───────────────────────────────────────────────────────────────────
await ensureFrontendBuilt();

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    handleWebSocket(socket);
    return response;
  }

  try {
    return serveStatic(url.pathname);
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
});

console.log(`🚀 Server at http://localhost:${PORT}`);
if (!Deno.args.includes("--dev")) await open(`http://localhost:${PORT}`);
