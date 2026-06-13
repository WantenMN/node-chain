// backend/generate_nodes.ts
import { db } from "./db.ts";

// ── Random content generator ─────────────────────────────────────────────────

const SUBJECTS = [
  "I", "we", "the team", "the client", "the user", "the system", "the server",
  "the database", "the API", "the frontend", "the backend", "the deployment",
  "the CI pipeline", "the cache", "the load balancer", "the webhook",
];

const VERBS = [
  "need to", "should", "must", "will", "can", "might", "decided to",
  "plan to", "want to", "have to", "are going to", "started to",
  "finished", "completed", "skipped", "postponed", "reviewed",
];

const ACTIONS = [
  "fix the bug in the auth module",
  "refactor the database queries",
  "deploy the new version to staging",
  "write unit tests for the payment flow",
  "optimize the search index",
  "migrate the legacy endpoints",
  "set up monitoring and alerts",
  "update the documentation",
  "review the pull request",
  "merge the feature branch",
  "rollback the last deployment",
  "investigate the memory leak",
  "configure the CI pipeline",
  "add rate limiting to the API",
  "implement caching for static assets",
  "upgrade the dependencies",
  "clean up the unused code",
  "benchmark the query performance",
  "set up a staging environment",
  "debug the WebSocket connection",
  "add pagination to the list endpoint",
  "implement file upload support",
  "fix the timezone handling",
  "add input validation",
  "restructure the project layout",
  "write integration tests",
  "set up error tracking",
  "optimize the bundle size",
  "add dark mode support",
  "implement drag and drop",
];

const DETAILS = [
  "It went smoothly.",
  "There were some issues.",
  "Took longer than expected.",
  "Need to follow up next week.",
  "Blocked by a dependency.",
  "Waiting for review.",
  "Already in production.",
  "Testing in staging now.",
  "Pair programmed on this.",
  "Discussed with the team.",
  "Got it working after a few tries.",
  "The performance improved significantly.",
  "Found a few edge cases to handle.",
  "This was a quick win.",
  "Required a database migration.",
  "Changed the API contract.",
  "Updated the README as well.",
  "Need to add error handling still.",
  "Works on my machine.",
  "Will revisit this later.",
  "Reverted the change.",
  "Shipped it behind a feature flag.",
  "The root cause was a race condition.",
  "Added a fallback mechanism.",
  "Cleaned up the related tests.",
];

function randomSentence(): string {
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const detail = Math.random() > 0.4
    ? " " + DETAILS[Math.floor(Math.random() * DETAILS.length)]
    : "";
  return `${subject} ${verb} ${action}.${detail}`;
}

// ── Generator ────────────────────────────────────────────────────────────────

async function generateNodes(trunkLength: number, branchCount: number) {
  console.log(`Generating trunk of ${trunkLength} nodes + ${branchCount} branches...`);

  db.exec("BEGIN");

  try {
    // Clear existing data
    db.exec("DELETE FROM branches");
    db.exec("DELETE FROM nodes");

    // --- 1. Generate main trunk ---
    const insertNode = db.prepare(
      "INSERT INTO nodes (content, parent_id, order_val) VALUES (?, ?, ?)"
    );

    const trunkNodeIds: number[] = [];
    let lastParentId: number | null = null;

    for (let i = 0; i < trunkLength; i++) {
      const result = insertNode.run(randomSentence(), lastParentId, i + 1);
      const id = result.lastInsertRowid as number;
      trunkNodeIds.push(id);
      lastParentId = id;
    }

    // --- 2. Generate branches from random fork points ---
    const forkPoints = new Set<number>();
    const safeUpperBound = Math.max(0, trunkNodeIds.length - 2);
    while (forkPoints.size < branchCount && forkPoints.size < trunkNodeIds.length) {
      const idx = Math.floor(Math.random() * (safeUpperBound + 1));
      forkPoints.add(trunkNodeIds[idx]);
    }

    let totalBranchNodes = 0;
    for (const parentId of forkPoints) {
      const branchLength = Math.floor(Math.random() * 11) + 5; // 5–15 nodes
      let branchParentId: number | null = parentId;

      for (let i = 0; i < branchLength; i++) {
        const maxSibling = db.prepare(
          "SELECT MAX(order_val) as m FROM nodes WHERE parent_id = ?"
        ).get(branchParentId) as { m: number | null };
        const order_val = (maxSibling?.m ?? 0) + 1;

        const result = insertNode.run(randomSentence(), branchParentId, order_val);
        branchParentId = result.lastInsertRowid as number;
        totalBranchNodes++;
      }
    }

    // --- 3. Rebuild branches table ---
    const leaves = db.prepare(`
      SELECT id FROM nodes
      WHERE id NOT IN (SELECT DISTINCT parent_id FROM nodes WHERE parent_id IS NOT NULL)
    `).all() as { id: number }[];

    db.exec("DELETE FROM branches");
    const insertBranch = db.prepare("INSERT INTO branches (leaf_id) VALUES (?)");
    for (const leaf of leaves) {
      insertBranch.run(leaf.id);
    }

    db.exec("COMMIT");

    console.log(`✓ ${trunkLength} trunk nodes + ${totalBranchNodes} branch nodes (${leaves.length} branches)`);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

if (import.meta.main) {
  const t = performance.now();
  await generateNodes(2000, 20);
  console.log(`Done in ${(performance.now() - t).toFixed(0)}ms`);
}
