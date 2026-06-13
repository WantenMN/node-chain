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

export function getPathFromLeaf(leafId: number): number[] {
  const pathQuery = db.prepare(`
    WITH RECURSIVE path_to_root(id, parent_id, depth) AS (
      SELECT id, parent_id, 0 FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.id, n.parent_id, p.depth + 1
      FROM nodes n JOIN path_to_root p ON n.id = p.parent_id
      WHERE n.id IS NOT NULL
    )
    SELECT id FROM path_to_root ORDER BY depth DESC;
  `);
  const rows = pathQuery.all(leafId) as { id: number }[];
  return rows.map((row) => row.id);
}

export function getAllBranches() {
  // Find leaf nodes: nodes that are never a parent of another node.
  const leaves = db.prepare(`
    SELECT id, content FROM nodes
    WHERE id NOT IN (SELECT DISTINCT parent_id FROM nodes WHERE parent_id IS NOT NULL)
  `).all() as { id: number; content: string }[];

  // Single root node (no parent) is also a leaf if it has no children.
  if (leaves.length === 0) {
    const root = db.prepare("SELECT id, content FROM nodes WHERE parent_id IS NULL LIMIT 1").get() as any;
    if (root) leaves.push(root);
    else return [];
  }

  // Build all paths using a single recursive CTE from leaves → root.
  // Each leaf starts with its own path, then walks up the tree appending ancestors.
  // This is much faster than N separate getPathFromLeaf calls.
  const leafIds = leaves.map((l) => l.id);
  const placeholders = leafIds.map(() => "?").join(",");
  const pathRows = db.prepare(`
    WITH RECURSIVE chain(leaf_id, current_id, path, depth) AS (
      SELECT id, id, CAST(id AS TEXT), 0 FROM nodes WHERE id IN (${placeholders})
      UNION ALL
      SELECT c.leaf_id, n.parent_id, n.parent_id || ',' || c.path, c.depth + 1
      FROM chain c JOIN nodes n ON c.current_id = n.id
      WHERE n.parent_id IS NOT NULL
    )
    SELECT leaf_id, path FROM (
      SELECT leaf_id, path, depth,
             ROW_NUMBER() OVER (PARTITION BY leaf_id ORDER BY depth DESC) AS rn
      FROM chain
    ) WHERE rn = 1
  `).all(...leafIds) as { leaf_id: number; path: string }[];

  const pathMap = new Map<number, number[]>();
  for (const row of pathRows) {
    pathMap.set(row.leaf_id, row.path.split(",").map(Number));
  }

  // Rebuild branches table in a transaction
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM branches");
    const insert = db.prepare("INSERT INTO branches (leaf_id) VALUES (?)");
    for (const leafId of leafIds) {
      insert.run(leafId);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const branchRows = db.prepare("SELECT id, leaf_id FROM branches").all() as any[];
  const branchIdMap = new Map(branchRows.map((r) => [r.leaf_id, r.id]));

  const leafContentMap = new Map(leaves.map((l) => [l.id, l.content]));

  return leafIds.map((leafId) => {
    const path = pathMap.get(leafId) ?? [leafId];
    return {
      branchId: branchIdMap.get(leafId),
      path,
      count: path.length,
      preview: leafContentMap.get(leafId) ?? "",
    };
  }).sort((a, b) => b.count - a.count);
}
