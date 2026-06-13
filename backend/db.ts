import { join } from "@std/path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = join(import.meta.dirname!, "data");
try {
  Deno.statSync(DATA_DIR);
} catch {
  Deno.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(join(DATA_DIR, "data.db"));
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    parent_id INTEGER,
    project_id INTEGER,
    order_val REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES nodes(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    leaf_id INTEGER NOT NULL UNIQUE,
    FOREIGN KEY (leaf_id) REFERENCES nodes(id)
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_project_id ON nodes(project_id)`);

// ── Project helpers ─────────────────────────────────────────────────────────

export function getProjects() {
  return db.prepare(`
    SELECT p.id, p.name, p.created_at,
      (SELECT COUNT(*) FROM nodes n WHERE n.project_id = p.id) AS nodeCount,
      (SELECT COUNT(*) FROM branches b JOIN nodes n ON b.leaf_id = n.id WHERE n.project_id = p.id) AS branchCount
    FROM projects p
    ORDER BY p.created_at DESC
  `).all() as { id: number; name: string; created_at: string; nodeCount: number; branchCount: number }[];
}

export function createProject(name: string) {
  const result = db.prepare("INSERT INTO projects (name) VALUES (?)").run(name);
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid) as any;
}

export function deleteProject(id: number) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM branches WHERE leaf_id IN (SELECT id FROM nodes WHERE project_id = ?)").run(id);
    db.prepare("DELETE FROM nodes WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ── Branch helpers ──────────────────────────────────────────────────────────

export function getNode(id: number) {
  return db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as any;
}

/**
 * Branch metadata only — no path, no full node data.
 * Single recursive CTE computes depth for all nodes, then filters to leaves.
 * Returns { branchId (leaf node id), count (depth+1), preview (leaf content) }.
 * Path is NOT included — use getBranchPath(leafId) separately.
 */
export function getBranchMeta(projectId?: number | null) {
  const projectFilter = projectId != null
    ? "WHERE n.project_id = ?"
    : "WHERE n.project_id IS NULL";
  const rootFilter = projectId != null
    ? "WHERE parent_id IS NULL AND project_id = ?"
    : "WHERE parent_id IS NULL AND project_id IS NULL";

  const rows = db.prepare(`
    WITH RECURSIVE tree(id, depth) AS (
      SELECT id, 0 FROM nodes ${rootFilter}
      UNION ALL
      SELECT n.id, t.depth + 1
      FROM nodes n JOIN tree t ON n.parent_id = t.id
    )
    SELECT t.id AS leafId, t.depth, n.content
    FROM tree t
    JOIN nodes n ON n.id = t.id
    WHERE NOT EXISTS (SELECT 1 FROM nodes c WHERE c.parent_id = t.id)
    ORDER BY depth DESC
  `).all(...(projectId != null ? [projectId] : [])) as { leafId: number; depth: number; content: string }[];

  if (rows.length === 0) {
    const root = db.prepare(
      `SELECT id, content FROM nodes ${rootFilter} LIMIT 1`
    ).get(...(projectId != null ? [projectId] : [])) as any;
    if (!root) return [];
    return [{ branchId: root.id, count: 1, preview: root.content }];
  }

  return rows.map((r) => ({
    branchId: r.leafId,
    count: r.depth + 1,
    preview: r.content,
  }));
}

/**
 * Get the ordered node IDs for a branch, from root to the given leaf.
 * Recursive CTE walks leaf → root, only touches nodes on one path.
 */
export function getBranchPath(leafId: number): number[] {
  const rows = db.prepare(`
    WITH RECURSIVE path(id, parent_id) AS (
      SELECT id, parent_id FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.id, n.parent_id FROM nodes n JOIN path p ON n.id = p.parent_id
    )
    SELECT id FROM path
  `).all(leafId) as { id: number }[];
  return rows.map((r) => r.id).reverse();
}

/**
 * Fetch full node objects for a branch, in root→leaf order.
 * Recursive CTE walks leaf→root, returns ordered by depth DESC (root first).
 * Only touches nodes on the single path — no full-table scan.
 */
export function getBranchNodes(leafId: number) {
  return db.prepare(`
    WITH RECURSIVE path(id, parent_id, depth) AS (
      SELECT id, parent_id, 0 FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.id, n.parent_id, p.depth + 1 FROM nodes n JOIN path p ON n.id = p.parent_id
    )
    SELECT n.* FROM path p JOIN nodes n ON n.id = p.id ORDER BY p.depth DESC
  `).all(leafId) as any[];
}
