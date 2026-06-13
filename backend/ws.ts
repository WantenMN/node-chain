import { db, getNode, getBranchMeta, getBranchPath, getBranchNodes } from "./db.ts";

const clients = new Set<any>();

export function broadcast(data: unknown, exclude?: any) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws !== exclude && ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function send(ws: any, data: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

/** Broadcast lightweight branch metadata to all clients. */
function broadcastBranchMeta(exclude?: any) {
  const branches = getBranchMeta();
  broadcast({ action: "branches:list", data: branches }, exclude);
  return branches;
}

export function setupWebSocket(wss: any) {
  wss.on("connection", (ws: any) => {
    clients.add(ws);
    console.log(`🔌 Client connected (${clients.size} total)`);

    ws.on("message", (raw: any) => {
      try { handleMessage(ws, raw.toString()); }
      catch (e) { console.error("WS error:", e); }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`🔌 Client disconnected (${clients.size} total)`);
    });
  });
}

function handleMessage(ws: any, raw: string) {
  const msg = JSON.parse(raw);
  const { action, requestId, payload } = msg;

  switch (action) {
    // ── Branch metadata (lightweight — no paths, no node data) ───────────
    case "branches:list": {
      const branches = getBranchMeta();
      send(ws, { action: "branches:list", requestId, data: branches });
      break;
    }

    // ── Single branch path (leaf → root IDs) ────────────────────────────
    case "branches:path": {
      const { leafId } = payload;
      const path = getBranchPath(leafId);
      send(ws, { action: "branches:path", requestId, data: path });
      break;
    }

    // ── Fork points on a branch (nodes with >1 child, leaf→root) ────────
    case "branches:forks": {
      const { leafId } = payload as { leafId: number };
      if (leafId == null) {
        send(ws, { action: "branches:forks", requestId, data: [] });
        break;
      }
      // Walk from leaf to root via parent_id, check each node for >1 child
      const rows = db.prepare(`
        WITH RECURSIVE path(id, parent_id) AS (
          SELECT id, parent_id FROM nodes WHERE id = ?
          UNION ALL
          SELECT n.id, n.parent_id FROM nodes n JOIN path p ON n.id = p.parent_id
        )
        SELECT p.id FROM path p
        WHERE p.parent_id IS NOT NULL
          AND (SELECT COUNT(*) FROM nodes WHERE parent_id = p.id) > 1
      `).all(leafId) as { id: number }[];
      send(ws, { action: "branches:forks", requestId, data: rows.map((r) => r.id) });
      break;
    }

    // ── Child branches from a node (for fork popover) ───────────────────
    case "branches:from": {
      const { nodeId } = payload;
      const children = db.prepare("SELECT id, content FROM nodes WHERE parent_id = ?").all(nodeId) as any[];
      if (children.length === 0) {
        send(ws, { action: "branches:from", requestId, data: [] });
        break;
      }
      const childIds = children.map((c) => c.id);
      const placeholders = childIds.map(() => "?").join(",");
      const leafRows = db.prepare(`
        WITH RECURSIVE subtree(child_id, current_id, path) AS (
          SELECT id, id, CAST(id AS TEXT) FROM nodes WHERE id IN (${placeholders})
          UNION ALL
          SELECT s.child_id, n.id, s.path || ',' || CAST(n.id AS TEXT)
          FROM subtree s JOIN nodes n ON n.parent_id = s.current_id
        )
        SELECT child_id, path FROM subtree s
        WHERE s.current_id NOT IN (
          SELECT DISTINCT parent_id FROM nodes WHERE parent_id IS NOT NULL
        )
      `).all(...childIds) as { child_id: number; path: string }[];

      const pathMap = new Map<number, string[]>();
      for (const row of leafRows) {
        if (!pathMap.has(row.child_id)) pathMap.set(row.child_id, []);
        pathMap.get(row.child_id)!.push(row.path);
      }

      const result = children.map((child) => {
        const rawPaths = pathMap.get(child.id) ?? [];
        const branches = rawPaths.map((p) => {
          const path = [nodeId, ...p.split(",").map(Number)];
          return { path, count: path.length };
        });
        return { child, branches };
      });
      send(ws, { action: "branches:from", requestId, data: result });
      break;
    }

    // ── Load nodes for a branch (by leafId) ─────────────────────────────
    case "nodes:list": {
      const { leafId, path } = payload;
      if (leafId != null) {
        // New: load by leafId — single recursive CTE, no full-table scan
        send(ws, { action: "nodes:list", requestId, data: getBranchNodes(leafId) });
      } else if (path && Array.isArray(path) && path.length > 0) {
        // Legacy: load by path array — fetch from DB by IDs
        const placeholders = path.map(() => "?").join(",");
        const nodeMap = new Map(
          (db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...path) as any[])
            .map((n: any) => [n.id, n])
        );
        send(ws, { action: "nodes:list", requestId, data: path.map((id: number) => nodeMap.get(id)).filter(Boolean) });
      } else {
        const nodes = db.prepare("SELECT * FROM nodes ORDER BY order_val ASC").all();
        send(ws, { action: "nodes:list", requestId, data: nodes });
      }
      break;
    }

    // ── Create node ─────────────────────────────────────────────────────
    case "nodes:create": {
      const { content, parent_id, after_id, linked } = payload;

      let order_val: number;
      let nextNode: { id: number; order_val: number; parent_id: number | null } | undefined;

      if (after_id != null) {
        const afterNode = db.prepare("SELECT order_val FROM nodes WHERE id = ?").get(after_id) as { order_val: number } | undefined;
        if (afterNode) {
          nextNode = db.prepare(
            "SELECT id, order_val, parent_id FROM nodes WHERE order_val > ? ORDER BY order_val ASC LIMIT 1"
          ).get(afterNode.order_val) as typeof nextNode;
          order_val = nextNode
            ? (afterNode.order_val + nextNode.order_val) / 2
            : afterNode.order_val + 1;
        } else {
          const max = db.prepare("SELECT MAX(order_val) as m FROM nodes").get() as { m: number | null };
          order_val = (max.m ?? 0) + 1;
        }
      } else {
        const max = db.prepare("SELECT MAX(order_val) as m FROM nodes").get() as { m: number | null };
        order_val = (max.m ?? 0) + 1;
      }

      const result = db.prepare(
        "INSERT INTO nodes (content, parent_id, order_val) VALUES (?, ?, ?)"
      ).run(content, parent_id ?? null, order_val);

      const node = db.prepare("SELECT * FROM nodes WHERE id = ?").get(result.lastInsertRowid);
      send(ws, { action: "nodes:create", requestId, data: node });
      broadcast({ action: "nodes:created", data: node }, ws);

      if (linked && nextNode && nextNode.parent_id === after_id) {
        db.prepare("UPDATE nodes SET parent_id = ? WHERE id = ?").run(
          result.lastInsertRowid, nextNode.id
        );
        const updated = db.prepare("SELECT * FROM nodes WHERE id = ?").get(nextNode.id);
        send(ws, { action: "nodes:updated", data: updated });
        broadcast({ action: "nodes:updated", data: updated }, ws);
      }

      const branches = broadcastBranchMeta(ws);
      send(ws, { action: "branches:list", data: branches });
      break;
    }

    // ── Delete single node ──────────────────────────────────────────────
    case "nodes:delete": {
      const { id } = payload;
      const node = db.prepare("SELECT parent_id FROM nodes WHERE id = ?").get(id) as { parent_id: number | null } | undefined;
      const grandparentId = node?.parent_id ?? null;
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE nodes SET parent_id = ? WHERE parent_id = ?").run(grandparentId, id);
        db.prepare("DELETE FROM branches WHERE leaf_id = ?").run(id);
        db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      send(ws, { action: "nodes:delete", requestId, data: { ok: true } });
      broadcast({ action: "nodes:deleted", data: { id } }, ws);

      const branches = broadcastBranchMeta(ws);
      send(ws, { action: "branches:list", data: branches });
      break;
    }

    // ── Batch delete ────────────────────────────────────────────────────
    case "nodes:delete_batch": {
      const { ids } = payload as { ids: number[] };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        send(ws, { action: "nodes:delete_batch", requestId, error: "ids array is required" });
        break;
      }

      const placeholders = ids.map(() => "?").join(",");

      db.exec("BEGIN");
      try {
        db.prepare(`
          UPDATE nodes SET parent_id = (
            SELECT p.parent_id FROM nodes p WHERE p.id = nodes.parent_id
          )
          WHERE parent_id IN (${placeholders}) AND id NOT IN (${placeholders})
        `).run(...ids, ...ids);
        db.prepare(`DELETE FROM branches WHERE leaf_id IN (${placeholders})`).run(...ids);
        db.prepare(`DELETE FROM nodes WHERE id IN (${placeholders})`).run(...ids);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      send(ws, { action: "nodes:delete_batch", requestId, data: { ok: true } });
      broadcast({ action: "nodes:deleted_batch", data: { ids } }, ws);

      const branches = broadcastBranchMeta(ws);
      send(ws, { action: "branches:list", data: branches });
      break;
    }

    // ── Update node content ─────────────────────────────────────────────
    case "nodes:update": {
      const { id, content } = payload;
      db.prepare("UPDATE nodes SET content = ? WHERE id = ?").run(content, id);
      const updated = getNode(id);
      send(ws, { action: "nodes:update", requestId, data: updated });
      broadcast({ action: "nodes:updated", data: updated }, ws);
      break;
    }

    // ── Reorder nodes ───────────────────────────────────────────────────
    case "nodes:reorder": {
      const { path } = payload;
      if (!path || !Array.isArray(path)) {
        send(ws, { action: "nodes:reorder", requestId, error: "Path is required" });
        break;
      }

      if (path.length === 0) {
        send(ws, { action: "nodes:reorder", requestId, data: { ok: true } });
        break;
      }

      const ids = path as number[];
      const placeholders = ids.map(() => "?").join(",");
      const currentNodes = db.prepare(
        `SELECT id, parent_id, order_val FROM nodes WHERE id IN (${placeholders})`
      ).all(...ids) as { id: number; parent_id: number | null; order_val: number }[];

      const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
      const rootParentId = currentMap.get(ids[0])?.parent_id ?? null;

      const updateStmt = db.prepare("UPDATE nodes SET parent_id = ?, order_val = ? WHERE id = ?");
      for (let i = 0; i < ids.length; i++) {
        const nodeId = ids[i];
        const expectedParent = i > 0 ? ids[i - 1] : rootParentId;
        const current = currentMap.get(nodeId);
        if (!current || current.parent_id !== expectedParent) {
          updateStmt.run(expectedParent, i + 1, nodeId);
        }
      }

      send(ws, { action: "nodes:reorder", requestId, data: { ok: true } });
      break;
    }
  }
}
