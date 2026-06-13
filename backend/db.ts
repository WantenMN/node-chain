import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = join(import.meta.dirname!, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, "data.db"));
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    parent_id INTEGER,
    order_val REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES nodes(id)
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
export function getBranchMeta() {
  const rows = db.prepare(`
    WITH RECURSIVE tree(id, depth) AS (
      SELECT id, 0 FROM nodes WHERE parent_id IS NULL
      UNION ALL
      SELECT n.id, t.depth + 1
      FROM nodes n JOIN tree t ON n.parent_id = t.id
    )
    SELECT t.id AS leafId, t.depth, n.content
    FROM tree t
    JOIN nodes n ON n.id = t.id
    WHERE t.id NOT IN (SELECT DISTINCT parent_id FROM nodes WHERE parent_id IS NOT NULL)
    ORDER BY depth DESC
  `).all() as { leafId: number; depth: number; content: string }[];

  if (rows.length === 0) {
    const root = db.prepare("SELECT id, content FROM nodes WHERE parent_id IS NULL LIMIT 1").get() as any;
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
