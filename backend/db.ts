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

// ── Branch helpers ──────────────────────────────────────────────────────────

export function getNode(id: number) {
  return db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as any;
}

export function getPathFromLeaf(leafId: number): number[] {
  const path: number[] = [];
  let cur: number | null = leafId;
  while (cur) {
    path.push(cur);
    const node = getNode(cur);
    cur = node?.parent_id ?? null;
  }
  return path.reverse();
}

export function getAllBranches() {
  const allNodes = db.prepare("SELECT id, parent_id FROM nodes").all() as any[];
  if (allNodes.length === 0) return [];

  const parentIds = new Set(allNodes.map((n) => n.parent_id).filter(Boolean));
  const leaves = allNodes.filter((n) => !parentIds.has(n.id));

  const leafIdSet = new Set(leaves.map((l) => l.id));
  const allBranchRows = db.prepare("SELECT id, leaf_id FROM branches").all() as any[];
  const staleBranches = allBranchRows.filter((b) => !leafIdSet.has(b.leaf_id));

  // Migrate: if a stale branch's leaf is the parent of a current leaf, reuse its ID
  const staleByLeafId = new Map(staleBranches.map((b) => [b.leaf_id, b]));
  const migratedStaleIds = new Set();

  for (const leaf of leaves) {
    const existing = db.prepare("SELECT id FROM branches WHERE leaf_id = ?").get(leaf.id) as any;
    if (existing) continue; // already tracked
    const parentBranch = staleByLeafId.get(leaf.parent_id);
    if (parentBranch) {
      db.prepare("UPDATE branches SET leaf_id = ? WHERE id = ?").run(leaf.id, parentBranch.id);
      migratedStaleIds.add(parentBranch.id);
    } else {
      db.prepare("INSERT INTO branches (leaf_id) VALUES (?)").run(leaf.id);
    }
  }

  // Clean up stale entries that weren't migrated
  for (const stale of staleBranches) {
    if (!migratedStaleIds.has(stale.id)) {
      db.prepare("DELETE FROM branches WHERE id = ?").run(stale.id);
    }
  }

  const branchRows = db.prepare("SELECT id, leaf_id FROM branches").all() as any[];
  const branchIdMap = new Map(branchRows.map((r) => [r.leaf_id, r.id]));

  return leaves.map((leaf) => {
    const path = getPathFromLeaf(leaf.id);
    const firstNode = getNode(path[0]);
    return {
      branchId: branchIdMap.get(leaf.id),
      path,
      count: path.length,
      preview: firstNode?.content ?? "",
    };
  }).sort((a, b) => b.count - a.count);
}
