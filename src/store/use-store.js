import { create } from "zustand";
import { pathKey, pathStartsWith } from "../lib/path-utils";

function createWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8080/ws`;
}

export const useStore = create((set, get) => {
  let ws = null;
  let pending = {};
  let broadcastHandler = null;

  function send(action, payload) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      pending[requestId] = { resolve, reject };
      ws?.send(JSON.stringify({ action, requestId, payload }));
    });
  }

  function setupBroadcast() {
    if (!ws) return;
    ws._onBroadcast = (msg) => {
      if (broadcastHandler) broadcastHandler(msg);
    };
  }

  function handleBroadcast(msg) {
    const state = get();

    if (msg.action === "branches:list") {
      const newBranches = msg.data;

      const pendingNodeId = state._newBranchNodeId;
      if (pendingNodeId) set({ _newBranchNodeId: null });

      set((s) => {
        let newPath = s.selectedPath;

        if (newPath.length === 0) {
          newPath = newBranches[0]?.path ?? [];
        } else if (pendingNodeId) {
          const target = newBranches.find((b) => b.path.includes(pendingNodeId));
          if (target) newPath = target.path;
        } else {
          const currentExists = newBranches.some(
            (b) => pathKey(b.path) === pathKey(newPath)
          );
          if (currentExists) {
            const longer = newBranches.filter(
              (b) => b.path.length > newPath.length && pathStartsWith(b.path, newPath)
            );
            newPath = longer.length > 0 ? longer[0].path : newPath;
          } else {
            const supersets = newBranches.filter((b) => pathStartsWith(b.path, newPath));
            newPath = supersets.length > 0 ? supersets[0].path : newBranches[0]?.path ?? newPath;
          }
        }

        // Merge: update existing objects in-place, add/remove as needed
        const oldMap = new Map(s.branches.map((b) => [b.branchId, b]));
        const merged = newBranches.map((nb) => {
          const old = oldMap.get(nb.branchId);
          if (old) {
            old.path = nb.path;
            old.count = nb.count;
            old.preview = nb.preview;
            return old;
          }
          return nb;
        });

        const pathChanged = pathKey(newPath) !== pathKey(s.selectedPath);
        return pathChanged
          ? { branches: merged, selectedPath: newPath }
          : { branches: merged };
      });
    } else if (msg.action === "nodes:updated") {
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === msg.data.id ? msg.data : n)),
      }));
    } else if (msg.action === "nodes:deleted") {
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== msg.data.id),
      }));
    }
  }

  function connect() {
    if (ws && ws.readyState !== WebSocket.CLOSED) return;
    ws = new WebSocket(createWsUrl());
    const currentWs = ws;
    broadcastHandler = handleBroadcast;
    setupBroadcast();

    ws.onopen = () => {
      if (ws !== currentWs) return;
      set({ connected: true });
      send("branches:list").then((data) => {
        set({
          branches: data,
          selectedPath: data.length > 0 ? data[0].path : [],
          loading: false,
        });
      });
    };

    ws.onclose = () => {
      if (ws !== currentWs) return;
      set({ connected: false });
      for (const { reject } of Object.values(pending)) reject(new Error("disconnected"));
      pending = {};
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const { requestId } = msg;
      if (requestId && pending[requestId]) {
        const { resolve, reject } = pending[requestId];
        delete pending[requestId];
        msg.error ? reject(new Error(msg.error)) : resolve(msg.data);
        return;
      }
      if (msg.action) ws._onBroadcast?.(msg);
    };
  }

  return {
    // State
    branches: [],
    selectedPath: [],
    nodes: [],
    input: "",
    loading: true,
    connected: false,
    _newBranchNodeId: null,
    _shouldFocusBottom: false,
    _skipLoadNodes: false,
    _submitting: false,
    _scrollToBottom: false,

    // Actions
    connect,
    send,

    selectPath: (path) => {
      set({ selectedPath: path, _shouldFocusBottom: true });
    },

    loadNodes: async (path) => {
      const nodes = await send("nodes:list", { path });
      set({ nodes });
    },

    createNode: async (payload) => {
      if (get()._submitting) return null;
      set({ _submitting: true });
      try {
        const node = await send("nodes:create", payload);
        if (payload.linked) {
          set((s) => {
            const idx = s.nodes.findIndex((n) => n.id === payload.after_id);
            const newNodes = [...s.nodes];
            if (idx >= 0) newNodes.splice(idx + 1, 0, node);
            else newNodes.push(node);
            const newPath = [...s.selectedPath, node.id];
            // Sync the selected branch's path so sidebar isSelected stays correct
            const newBranches = s.branches.map((b) => {
              if (b.path === s.selectedPath || pathKey(b.path) === pathKey(s.selectedPath)) {
                b.path = newPath;
                b.count = newPath.length;
              }
              return b;
            });
            return { nodes: newNodes, selectedPath: newPath, branches: newBranches, _skipLoadNodes: true };
          });
        } else {
          set({ _newBranchNodeId: node.id });
        }
        return node;
      } finally {
        set({ _submitting: false });
      }
    },

    deleteNode: async (id) => {
      set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id) }));
      await send("nodes:delete", { id });
    },

    setInput: (value) => set({ input: value }),

    appendNode: async () => {
      const { input, nodes, connected, _submitting, send: doSend } = get();
      const text = input.trim();
      if (!text || !connected || _submitting) return;
      const parentId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;
      set({ input: "", _submitting: true });
      try {
        const node = await doSend("nodes:create", { content: text, parent_id: parentId });
        set((s) => {
          const newPath = [...s.selectedPath, node.id];
          const newBranches = s.branches.map((b) => {
            if (b.path === s.selectedPath || pathKey(b.path) === pathKey(s.selectedPath)) {
              b.path = newPath;
              b.count = newPath.length;
            }
            return b;
          });
          return {
            nodes: [...s.nodes, node],
            selectedPath: newPath,
            branches: newBranches,
            _skipLoadNodes: true,
            _scrollToBottom: true,
          };
        });
      } finally {
        set({ _submitting: false });
      }
    },

    getDisplayIndex: (nodeId) => {
      const idx = get().nodes.findIndex((n) => n.id === nodeId);
      return idx >= 0 ? idx + 1 : "?";
    },

    getForkPoints: () => {
      const { branches } = get();
      const forkPoints = new Set();
      for (const branch of branches) {
        for (let i = 0; i < branch.path.length - 1; i++) {
          const parent = branch.path[i];
          const child = branch.path[i + 1];
          for (const other of branches) {
            const idx = other.path.indexOf(parent);
            if (idx >= 0 && idx < other.path.length - 1 && other.path[idx + 1] !== child) {
              forkPoints.add(parent);
            }
          }
        }
      }
      return forkPoints;
    },
  };
});
