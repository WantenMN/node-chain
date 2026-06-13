import { db, getNode, getAllBranches, getPathFromLeaf } from "./db.ts";

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
    case "branches:list": {
      send(ws, { action: "branches:list", requestId, data: getAllBranches() });
      break;
    }

    case "branches:from": {
      const { nodeId } = payload;
      const children = db.prepare("SELECT id, content FROM nodes WHERE parent_id = ?").all(nodeId) as any[];
      const result = children.map((child) => {
        const leaves = db.prepare(`
          WITH RECURSIVE descendants(id) AS (
            SELECT id FROM nodes WHERE id = ?
            UNION ALL
            SELECT n.id FROM nodes n JOIN descendants d ON n.parent_id = d.id
          )
          SELECT id FROM descendants
          WHERE id NOT IN (SELECT DISTINCT parent_id FROM nodes WHERE parent_id IS NOT NULL)
        `).all(child.id) as any[];
        const paths = leaves.map((leaf) => getPathFromLeaf(leaf.id));
        return { child, branches: paths.map((p) => ({ path: p, count: p.length })) };
      });
      send(ws, { action: "branches:from", requestId, data: result });
      break;
    }

    case "nodes:list": {
      const { path } = payload;
      if (path && Array.isArray(path) && path.length > 0) {
        const placeholders = path.map(() => "?").join(",");
        const nodeMap = new Map(
          (db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...path) as any[])
            .map((n) => [n.id, n])
        );
        const nodes = path.map((id) => nodeMap.get(id)).filter(Boolean);
        send(ws, { action: "nodes:list", requestId, data: nodes });
      } else {
        const nodes = db.prepare("SELECT * FROM nodes ORDER BY order_val ASC").all();
        send(ws, { action: "nodes:list", requestId, data: nodes });
      }
      break;
    }

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

      const branches = getAllBranches();
      send(ws, { action: "branches:list", data: branches });
      broadcast({ action: "branches:list", data: branches }, ws);
      break;
    }

    case "nodes:delete": {
      const { id } = payload;
      const node = db.prepare("SELECT parent_id FROM nodes WHERE id = ?").get(id) as { parent_id: number | null } | undefined;
      const grandparentId = node?.parent_id ?? null;
      db.prepare("UPDATE nodes SET parent_id = ? WHERE parent_id = ?").run(grandparentId, id);
      db.prepare("DELETE FROM branches WHERE leaf_id = ?").run(id);
      db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
      send(ws, { action: "nodes:delete", requestId, data: { ok: true } });
      broadcast({ action: "nodes:deleted", data: { id } }, ws);

      const branches = getAllBranches();
      send(ws, { action: "branches:list", data: branches });
      broadcast({ action: "branches:list", data: branches }, ws);
      break;
    }

    case "nodes:update": {
      const { id, content } = payload;
      db.prepare("UPDATE nodes SET content = ? WHERE id = ?").run(content, id);
      const updated = getNode(id);
      send(ws, { action: "nodes:update", requestId, data: updated });
      broadcast({ action: "nodes:updated", data: updated }, ws);
      break;
    }

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

      // Only UPDATE nodes whose parent actually changed (typically just 2-3 nodes).
      // Fetch current parents in one query instead of N separate queries.
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
        // Only update if parent actually changed
        if (!current || current.parent_id !== expectedParent) {
          updateStmt.run(expectedParent, i + 1, nodeId);
        }
      }

      send(ws, { action: "nodes:reorder", requestId, data: { ok: true } });

      // Reorder doesn't change branch structure — skip expensive getAllBranches broadcast.
      // The requesting client already has the correct path from its optimistic update.
      break;
    }
  }
}
