import { db, getNode, getBranchMeta, getBranchPath, getBranchNodes, getProjects, createProject, deleteProject } from "./db.ts";

const clients = new Set<WebSocket>();

export function broadcast(data: unknown, exclude?: WebSocket) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

/** Broadcast lightweight branch metadata to all clients. */
function broadcastBranchMeta(projectId?: number | null, exclude?: WebSocket) {
  const branches = getBranchMeta(projectId);
  broadcast({ action: "branches:list", data: branches }, exclude);
  return branches;
}

export function handleWebSocket(socket: WebSocket) {
  clients.add(socket);
  console.log(`🔌 Client connected (${clients.size} total)`);

  socket.onmessage = (event) => {
    try { handleMessage(socket, event.data as string); }
    catch (e) { console.error("WS error:", e); }
  };

  socket.onclose = () => {
    clients.delete(socket);
    console.log(`🔌 Client disconnected (${clients.size} total)`);
  };
}

function handleMessage(ws: WebSocket, raw: string) {
  const msg = JSON.parse(raw);
  const { action, requestId, payload } = msg;

  switch (action) {
    // ── Projects ─────────────────────────────────────────────────────────
    case "projects:list": {
      const projects = getProjects();
      send(ws, { action: "projects:list", requestId, data: projects });
      break;
    }

    case "projects:create": {
      const { name } = payload;
      const project = createProject(name);
      send(ws, { action: "projects:create", requestId, data: project });
      broadcast({ action: "projects:updated", data: getProjects() }, ws);
      break;
    }

    case "projects:delete": {
      const { id: pid } = payload;
      deleteProject(pid);
      send(ws, { action: "projects:delete", requestId, data: { ok: true } });
      broadcast({ action: "projects:updated", data: getProjects() }, ws);
      break;
    }

    // ── Branch metadata (lightweight — no paths, no node data) ───────────
    case "branches:list": {
      const { projectId: bpId } = payload ?? {};
      const branches = getBranchMeta(bpId);
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
      const rows = db.prepare(`
        WITH RECURSIVE path(id, parent_id, child_count) AS (
          SELECT n.id, n.parent_id, (SELECT COUNT(*) FROM nodes c WHERE c.parent_id = n.id)
          FROM nodes n WHERE n.id = ?
          UNION ALL
          SELECT n.id, n.parent_id, (SELECT COUNT(*) FROM nodes c WHERE c.parent_id = n.id)
          FROM nodes n JOIN path p ON n.id = p.parent_id
        )
        SELECT id FROM path
        WHERE parent_id IS NOT NULL AND child_count > 1
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
        WITH RECURSIVE walk(child_id, current_id, depth) AS (
          SELECT id, id, 0 FROM nodes WHERE id IN (${placeholders})
          UNION ALL
          SELECT w.child_id, n.id, w.depth + 1
          FROM walk w JOIN nodes n ON n.parent_id = w.current_id
        )
        SELECT child_id, current_id AS leaf_id, MAX(depth) AS max_depth
        FROM walk w
        WHERE NOT EXISTS (SELECT 1 FROM nodes n2 WHERE n2.parent_id = w.current_id)
        GROUP BY child_id
      `).all(...childIds) as { child_id: number; leaf_id: number; max_depth: number }[];

      const leafMap = new Map(leafRows.map((r) => [r.child_id, r]));

      const result = children.map((child) => {
        const leaf = leafMap.get(child.id);
        if (!leaf) {
          return { child, branches: [{ path: [nodeId, child.id], count: 2 }] };
        }
        const fullPath = getBranchPath(leaf.leaf_id);
        const forkIdx = fullPath.indexOf(nodeId);
        const subPath = forkIdx >= 0 ? fullPath.slice(forkIdx) : [nodeId, child.id];
        return { child, branches: [{ path: subPath, count: subPath.length }] };
      });
      send(ws, { action: "branches:from", requestId, data: result });
      break;
    }

    // ── All node IDs in a subtree (for bulk delete) ─────────────────────
    case "branches:subtree": {
      const { nodeId } = payload;
      const rows = db.prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM nodes WHERE id = ?
          UNION ALL
          SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id
        )
        SELECT id FROM subtree
      `).all(nodeId) as { id: number }[];
      send(ws, { action: "branches:subtree", requestId, data: rows.map((r) => r.id) });
      break;
    }

    // ── Load nodes for a branch (by leafId) ─────────────────────────────
    case "nodes:list": {
      const { leafId, path, projectId: nlPid } = payload;
      if (leafId != null) {
        send(ws, { action: "nodes:list", requestId, data: getBranchNodes(leafId) });
      } else if (path && Array.isArray(path) && path.length > 0) {
        const placeholders = path.map(() => "?").join(",");
        const nodeMap = new Map(
          (db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...path) as any[])
            .map((n: any) => [n.id, n])
        );
        send(ws, { action: "nodes:list", requestId, data: path.map((id: number) => nodeMap.get(id)).filter(Boolean) });
      } else {
        const nodes = nlPid != null
          ? db.prepare("SELECT * FROM nodes WHERE project_id = ? ORDER BY order_val ASC").all(nlPid)
          : db.prepare("SELECT * FROM nodes WHERE project_id IS NULL ORDER BY order_val ASC").all();
        send(ws, { action: "nodes:list", requestId, data: nodes });
      }
      break;
    }

    // ── Create node ─────────────────────────────────────────────────────
    case "nodes:create": {
      const { content, parent_id, after_id, linked, projectId } = payload;

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
        "INSERT INTO nodes (content, parent_id, order_val, project_id) VALUES (?, ?, ?, ?)"
      ).run(content, parent_id ?? null, order_val, projectId ?? null);

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

      const branches = broadcastBranchMeta(projectId, ws);
      send(ws, { action: "branches:list", data: branches });
      break;
    }

    // ── Delete single node ──────────────────────────────────────────────
    case "nodes:delete": {
      const { id } = payload;
      const node = db.prepare("SELECT parent_id, project_id FROM nodes WHERE id = ?").get(id) as { parent_id: number | null; project_id: number | null } | undefined;
      const grandparentId = node?.parent_id ?? null;
      const deleteProjectId = node?.project_id ?? null;
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

      const branches = broadcastBranchMeta(deleteProjectId, ws);
      send(ws, { action: "branches:list", data: branches });
      break;
    }

    // ── Batch delete ────────────────────────────────────────────────────
    case "nodes:delete_batch": {
      const { ids, projectId: batchProjectId } = payload as { ids: number[]; projectId?: number };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        send(ws, { action: "nodes:delete_batch", requestId, error: "ids array is required" });
        break;
      }

      db.exec("BEGIN");
      try {
        db.exec("CREATE TEMP TABLE IF NOT EXISTS _delete_ids (id INTEGER PRIMARY KEY)");
        db.exec("DELETE FROM _delete_ids");
        const insertStmt = db.prepare("INSERT INTO _delete_ids VALUES (?)");
        for (const id of ids) insertStmt.run(id);
        db.exec(`
          UPDATE nodes SET parent_id = (
            WITH RECURSIVE walk(pid) AS (
              SELECT nodes.parent_id
              UNION ALL
              SELECT n.parent_id FROM nodes n JOIN walk w ON n.id = w.pid
              WHERE w.pid IN (SELECT id FROM _delete_ids)
            )
            SELECT pid FROM walk WHERE pid NOT IN (SELECT id FROM _delete_ids) LIMIT 1
          )
          WHERE parent_id IN (SELECT id FROM _delete_ids) AND id NOT IN (SELECT id FROM _delete_ids)
        `);
        db.exec(`DELETE FROM branches WHERE leaf_id IN (SELECT id FROM _delete_ids)`);
        db.exec(`DELETE FROM nodes WHERE id IN (SELECT id FROM _delete_ids)`);
        db.exec("DROP TABLE _delete_ids");
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      send(ws, { action: "nodes:delete_batch", requestId, data: { ok: true } });
      broadcast({ action: "nodes:deleted_batch", data: { ids } }, ws);

      const branches = broadcastBranchMeta(batchProjectId, ws);
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

      const firstNode = db.prepare("SELECT parent_id FROM nodes WHERE id = ?").get(ids[0]) as { parent_id: number | null } | undefined;
      const rootParentId = firstNode?.parent_id ?? null;

      db.exec("BEGIN");
      try {
        db.exec("CREATE TEMP TABLE IF NOT EXISTS _reorder (id INTEGER PRIMARY KEY, new_parent_id INTEGER, new_order_val REAL)");
        db.exec("DELETE FROM _reorder");
        const insertStmt = db.prepare("INSERT INTO _reorder VALUES (?, ?, ?)");
        for (let i = 0; i < ids.length; i++) {
          insertStmt.run(ids[i], i > 0 ? ids[i - 1] : rootParentId, i + 1);
        }
        db.exec(`
          UPDATE nodes SET
            parent_id = (SELECT r.new_parent_id FROM _reorder r WHERE r.id = nodes.id),
            order_val = (SELECT r.new_order_val FROM _reorder r WHERE r.id = nodes.id)
          WHERE nodes.id IN (SELECT id FROM _reorder)
        `);
        db.exec("DROP TABLE _reorder");
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      send(ws, { action: "nodes:reorder", requestId, data: { ok: true } });
      break;
    }
  }
}
