# Node Chain

A full-stack app for creating and managing content nodes that chain together. Supports linked chains, branching, and real-time sync via WebSocket.

## Features

- **Linked nodes** — append or insert nodes in a linear chain
- **Branching** — fork any node into a separate branch (Shift+Enter or click Branch)
- **Branch management** — sidebar lists all branches, switch with one click
- **Fork detection** — nodes with multiple children show a Branches popover to navigate sub-branches
- **Real-time sync** — all connected clients stay in sync via WebSocket broadcast
- **Responsive** — desktop sidebar + mobile dropdown branch selector

## Tech Stack

| Layer | Stack |
|-------|-------|
| Runtime | Deno |
| Backend | `node:http` + `node:sqlite` (WAL) + `ws` |
| Frontend | React 19 + Vite 8 + TanStack Router |
| State | Zustand |
| Styling | Tailwind CSS v4 + shadcnui-style components (CVA + clsx + tailwind-merge) |
| Icons | Lucide React |

## Commands

```bash
# Install dependencies
deno install

# Development (frontend HMR + backend, concurrently)
deno task dev

# Build frontend only
deno task build

# Production (build + start server, auto-opens browser)
deno task start
```

## Project Structure

```
├── backend/
│   ├── main.ts          # Entry point — HTTP + WebSocket server
│   ├── db.ts            # SQLite schema, node/branch queries
│   ├── ws.ts            # WebSocket handlers (CRUD + broadcast)
│   └── static.ts        # Static file serving for built frontend
├── src/
│   ├── main.jsx         # React entry point
│   ├── router.js        # TanStack Router setup
│   ├── store/
│   │   └── use-store.js # Zustand store (WebSocket, state, actions)
│   ├── pages/
│   │   └── home.jsx     # Main page — node list + sidebar + input
│   ├── components/
│   │   ├── navbar.jsx
│   │   ├── branch-sidebar.jsx
│   │   ├── node-card.jsx
│   │   ├── insert-node.jsx
│   │   ├── node-input-bar.jsx
│   │   └── ui/          # shadcnui-style primitives
│   │       ├── button.jsx
│   │       ├── input.jsx
│   │       ├── card.jsx
│   │       ├── badge.jsx
│   │       ├── dialog.jsx
│   │       ├── popover.jsx
│   │       ├── select.jsx
│   │       ├── skeleton.jsx
│   │       └── separator.jsx
│   ├── hooks/
│   ├── lib/
│   │   ├── utils.js     # cn() — clsx + tailwind-merge
│   │   └── path-utils.js
│   └── routes/
│       ├── __root.jsx
│       └── index.jsx
└── package.json
```

## WebSocket Protocol

All data operations go through WebSocket (`ws://host:8080/ws`). Messages use request/response with `requestId` for correlation.

### Client → Server

| Action | Payload | Description |
|--------|---------|-------------|
| `branches:list` | — | Get all branches (root-to-leaf paths) |
| `branches:from` | `{ nodeId }` | Get child branches from a fork node |
| `nodes:list` | `{ path }` | Get nodes for a given path |
| `nodes:create` | `{ content, parent_id?, after_id?, linked? }` | Create a node |
| `nodes:delete` | `{ id }` | Delete a node (orphans children) |

### Server → Client (broadcast)

| Action | Description |
|--------|-------------|
| `branches:list` | Updated branch list after mutation |
| `nodes:created` | New node created (by another client) |
| `nodes:updated` | Node modified (e.g. re-chained after linked insert) |
| `nodes:deleted` | Node deleted |

## Data Model

```sql
CREATE TABLE nodes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  content   TEXT NOT NULL,
  parent_id INTEGER REFERENCES nodes(id),
  order_val REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE branches (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  leaf_id INTEGER NOT NULL UNIQUE REFERENCES nodes(id)
);
```

- **nodes** — content tree with parent references and float ordering
- **branches** — stable branch IDs mapped to leaf nodes (auto-assigned on creation, migrated on extension)
