import { create } from "zustand";

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
      let branchWasDeleted = false;

      set((s) => {
        // Merge: update existing objects in-place, add/remove as needed
        const oldMap = new Map(s.branches.map((b) => [b.branchId, b]));
        const merged = newBranches.map((nb) => {
          const old = oldMap.get(nb.branchId);
          if (old) {
            old.count = nb.count;
            old.preview = nb.preview;
            return old;
          }
          return nb;
        });

        // Check if selected branch still exists
        const selectedExists = merged.some((b) => b.branchId === s.selectedLeafId);
        if (!selectedExists && merged.length > 0) {
          // Selected branch was deleted — switch to first available
          branchWasDeleted = true;
          return { branches: merged, selectedLeafId: merged[0].branchId };
        }

        return { branches: merged };
      });

      // If selected branch was deleted, reload nodes for the new branch
      if (branchWasDeleted) {
        get().selectBranch(get().selectedLeafId);
      }
    } else if (msg.action === "nodes:updated") {
      if (state._dirtyNodeIds.has(msg.data.id)) return;
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === msg.data.id ? msg.data : n)),
      }));
    } else if (msg.action === "nodes:created") {
      // Another client created a node — if we're on the same branch, we could
      // append it. For now, the branches:list broadcast will trigger a re-select
      // which reloads nodes. No action needed here.
    } else if (msg.action === "nodes:deleted") {
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== msg.data.id),
        selectedPath: s.selectedPath.filter((id) => id !== msg.data.id),
      }));
    } else if (msg.action === "nodes:deleted_batch") {
      const deletedIds = new Set(msg.data.ids);
      set((s) => ({
        nodes: s.nodes.filter((n) => !deletedIds.has(n.id)),
        selectedPath: s.selectedPath.filter((id) => !deletedIds.has(id)),
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
      set({ connected: true, _hasConnected: true });
      // Load branch metadata only (lightweight — no paths, no node data)
      send("branches:list").then((branches) => {
        const firstLeafId = branches.length > 0 ? branches[0].branchId : null;
        set({ branches, selectedLeafId: firstLeafId, loading: false });
        if (firstLeafId) get().selectBranch(firstLeafId);
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
    branches: [],           // { branchId, count, preview } — NO path
    selectedLeafId: null,   // which branch is selected (leaf node id)
    selectedPath: [],       // loaded lazily when branch is selected
    nodes: [],
    input: "",
    loading: true,
    connected: false,
    _hasConnected: false,
    _shouldFocusBottom: false,
    _skipLoadNodes: false,
    _submitting: false,
    _scrollToBottom: false,
    _draggedNodeId: null,
    _hoveredNodeId: null,
    _nodesRequestId: null,
    _dirtyNodeIds: new Set(),
    _forkNodeIds: new Set(),

    // Actions
    connect,
    send,

    /** Select a branch by its leafId. Fetches path + nodes. */
    selectBranch: async (leafId) => {
      const requestId = crypto.randomUUID();
      set({ _nodesRequestId: requestId, selectedLeafId: leafId, _shouldFocusBottom: true });

      // Fetch path first (lightweight — just IDs), then nodes
      const path = await send("branches:path", { leafId });
      if (get()._nodesRequestId !== requestId) return;
      set({ selectedPath: path });

      // Fetch fork points and nodes in parallel
      const [nodes, forkIds] = await Promise.all([
        send("nodes:list", { leafId }),
        send("branches:forks", { leafId }),
      ]);
      if (get()._nodesRequestId !== requestId) return;
      set({ nodes, _forkNodeIds: new Set(forkIds) });
    },

    /** Legacy selectPath — used by ForkPopover which passes a full path array. */
    selectPath: (path) => {
      const leafId = path[path.length - 1];
      get().selectBranch(leafId);
    },

    loadNodes: async (leafId) => {
      const requestId = crypto.randomUUID();
      set({ _nodesRequestId: requestId });
      const nodes = await send("nodes:list", { leafId });
      if (get()._nodesRequestId !== requestId) return;
      set({ nodes });
    },

    createNode: async (payload) => {
      if (get()._submitting) return null;
      set({ _submitting: true });
      const prevNodes = get().nodes;
      const prevPath = get().selectedPath;
      const prevBranches = get().branches;
      try {
        const node = await send("nodes:create", payload);
        if (payload.linked) {
          set((s) => {
            const idx = s.nodes.findIndex((n) => n.id === payload.after_id);
            const newNodes = [...s.nodes];
            if (idx >= 0) newNodes.splice(idx + 1, 0, node);
            else newNodes.push(node);
            // Insert new node after after_id in the path
            const afterIdx = s.selectedPath.indexOf(payload.after_id);
            const newPath = afterIdx >= 0
              ? [...s.selectedPath.slice(0, afterIdx + 1), node.id]
              : [...s.selectedPath, node.id];
            // Update the selected branch's count and leaf
            const newBranches = s.branches.map((b) => {
              if (b.branchId === s.selectedLeafId) {
                b.count = newPath.length;
                b.branchId = node.id;
                b.preview = node.content;
              }
              return b;
            });
            return { nodes: newNodes, selectedPath: newPath, selectedLeafId: node.id, branches: newBranches, _skipLoadNodes: true };
          });
          // Linked insert reparents children — refresh fork points
          send("branches:forks", { leafId: get().selectedLeafId }).then((forkIds) => {
            set({ _forkNodeIds: new Set(forkIds) });
          });
        } else {
          // New branch: add to sidebar and switch to it via selectBranch
          set((s) => {
            const newBranch = { branchId: node.id, count: 1, preview: node.content };
            const exists = s.branches.some((b) => b.branchId === node.id);
            const newBranches = exists ? s.branches : [...s.branches, newBranch];
            return {
              branches: newBranches,
              selectedLeafId: node.id,
            };
          });
          get().selectBranch(node.id);
        }
        return node;
      } catch {
        set({ nodes: prevNodes, selectedPath: prevPath, branches: prevBranches });
        return null;
      } finally {
        set({ _submitting: false });
      }
    },

    deleteNode: async (id) => {
      const prev = get().nodes;
      set({ nodes: prev.filter((n) => n.id !== id) });
      try {
        await send("nodes:delete", { id });
      } catch {
        set({ nodes: prev });
      }
    },

    deleteNodeWithChildren: async (id) => {
      const prev = get().nodes;
      const prevPath = get().selectedPath;

      const idsToDelete = new Set([id]);
      try {
        const childBranches = await send("branches:from", { nodeId: id });
        for (const { branches } of childBranches) {
          for (const branch of branches) {
            const forkIdx = branch.path.indexOf(id);
            const start = forkIdx >= 0 ? forkIdx + 1 : 0;
            for (let i = start; i < branch.path.length; i++) {
              idsToDelete.add(branch.path[i]);
            }
          }
        }
      } catch {}

      const idx = prevPath.indexOf(id);
      if (idx >= 0) {
        for (let i = idx + 1; i < prevPath.length; i++) {
          idsToDelete.add(prevPath[i]);
        }
      }

      const newPath = idx >= 0 ? prevPath.slice(0, idx) : prevPath;
      set({
        nodes: prev.filter((n) => !idsToDelete.has(n.id)),
        selectedPath: newPath,
      });

      try {
        await send("nodes:delete_batch", { ids: [...idsToDelete] });
      } catch {
        set({ nodes: prev, selectedPath: prevPath });
      }
    },

    updateNode: async (id, content) => {
      const prev = get().nodes;
      set((s) => ({
        nodes: s.nodes.map((n) => n.id === id ? { ...n, content } : n),
        _dirtyNodeIds: new Set([...s._dirtyNodeIds, id]),
      }));
      try {
        await send("nodes:update", { id, content });
      } catch {
        set({ nodes: prev });
      } finally {
        set((s) => {
          const next = new Set(s._dirtyNodeIds);
          next.delete(id);
          return { _dirtyNodeIds: next };
        });
      }
    },

    moveNode: async (nodeId, beforeId) => {
      const prevNodes = get().nodes;
      const prevPath = get().selectedPath;

      const dragIdx = prevNodes.findIndex((n) => n.id === nodeId);
      if (dragIdx < 0) return;

      const dragged = prevNodes[dragIdx];
      const without = prevNodes.filter((n) => n.id !== nodeId);
      let newNodes;
      if (beforeId != null) {
        const targetIdx = without.findIndex((n) => n.id === beforeId);
        newNodes = [...without];
        if (targetIdx >= 0) newNodes.splice(targetIdx, 0, dragged);
        else newNodes.push(dragged);
      } else {
        newNodes = [...without, dragged];
      }
      const newPath = newNodes.map((n) => n.id);

      set({ nodes: newNodes, selectedPath: newPath, _skipLoadNodes: true });

      try {
        await send("nodes:reorder", { id: nodeId, beforeId, path: newPath });
      } catch {
        set({ nodes: prevNodes, selectedPath: prevPath });
      }
    },

    setInput: (value) => set({ input: value }),

    appendNode: async () => {
      const { input, nodes, connected, _submitting, send: doSend } = get();
      const text = input.trim();
      if (!text || !connected || _submitting) return;
      const parentId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;
      const prevInput = input;
      const prevNodes = nodes;
      const prevPath = get().selectedPath;
      const prevBranches = get().branches;
      set({ input: "", _submitting: true });
      try {
        const node = await doSend("nodes:create", { content: text, parent_id: parentId });
        set((s) => {
          const newPath = [...s.selectedPath, node.id];
          const newBranches = s.branches.map((b) => {
            if (b.branchId === s.selectedLeafId) {
              b.count = newPath.length;
              b.branchId = node.id;
              b.preview = node.content;
            }
            return b;
          });
          return {
            nodes: [...s.nodes, node],
            selectedPath: newPath,
            selectedLeafId: node.id,
            branches: newBranches,
            _skipLoadNodes: true,
            _scrollToBottom: true,
          };
        });
      } catch {
        set({ input: prevInput, nodes: prevNodes, selectedPath: prevPath, branches: prevBranches });
      } finally {
        set({ _submitting: false });
      }
    },

    getDisplayIndex: (nodeId) => {
      const idx = get().nodes.findIndex((n) => n.id === nodeId);
      return idx >= 0 ? idx + 1 : "?";
    },

    /** Fork points loaded from the backend — nodes with >1 child. */
    getForkPoints: () => {
      return get()._forkNodeIds;
    },
  };
});
