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
            if (supersets.length > 0) {
              newPath = supersets[0].path;
            } else {
              // Find branch with longest common prefix (handles node deletion)
              let best = null;
              let bestLen = 0;
              for (const b of newBranches) {
                let common = 0;
                for (let i = 0; i < b.path.length && i < newPath.length; i++) {
                  if (b.path[i] === newPath[i]) common++;
                  else break;
                }
                if (common > bestLen) {
                  bestLen = common;
                  best = b;
                }
              }
              newPath = best ? best.path : newBranches[0]?.path ?? newPath;
            }
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
      // Skip if node is being edited locally
      if (state._dirtyNodeIds.has(msg.data.id)) return;
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
      set({ connected: true, _hasConnected: true });
      send("branches:list").then((data) => {
        set({
          branches: data,
          selectedPath: data.length > 0 ? data[0].path : [],
          loading: false,
        });
        // Resync nodes for current path after reconnect
        const currentPath = get().selectedPath;
        if (currentPath.length > 0) {
          get().loadNodes(currentPath);
        }
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
    _hasConnected: false,
    _newBranchNodeId: null,
    _shouldFocusBottom: false,
    _skipLoadNodes: false,
    _submitting: false,
    _scrollToBottom: false,
    _draggedNodeId: null,
    _hoveredNodeId: null,
    _nodesRequestId: null,
    _dirtyNodeIds: new Set(),

    // Actions
    connect,
    send,

    selectPath: (path) => {
      set({ selectedPath: path, _shouldFocusBottom: true });
    },

    loadNodes: async (path) => {
      const requestId = crypto.randomUUID();
      set({ _nodesRequestId: requestId });
      const nodes = await send("nodes:list", { path });
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

      // Collect descendant node IDs from child branches (only nodes AFTER the target)
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
      } catch {
        // If branches:from fails, fall back to deleting from current path
      }

      // Also collect nodes after this one in the current path
      const idx = prevPath.indexOf(id);
      if (idx >= 0) {
        for (let i = idx + 1; i < prevPath.length; i++) {
          idsToDelete.add(prevPath[i]);
        }
      }

      // Optimistic update: remove all collected nodes and truncate path
      const newPath = idx >= 0 ? prevPath.slice(0, idx) : prevPath;
      set({
        nodes: prev.filter((n) => !idsToDelete.has(n.id)),
        selectedPath: newPath,
      });

      // Send deletes to server
      try {
        await Promise.all([...idsToDelete].map((nid) => send("nodes:delete", { id: nid })));
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

      // Calculate the new nodes and new path
      const dragIdx = prevNodes.findIndex((n) => n.id === nodeId);
      if (dragIdx < 0) return;

      const dragged = prevNodes[dragIdx];
      const without = prevNodes.filter((n) => n.id !== nodeId);
      let newNodes;
      if (beforeId != null) {
        const targetIdx = without.findIndex((n) => n.id === beforeId);
        newNodes = [...without];
        if (targetIdx >= 0) newNodes.splice(targetIdx, 0, dragged);
        else newNodes.push(dragged); // Fallback if target not found
      } else {
        newNodes = [...without, dragged];
      }
      const newPath = newNodes.map((n) => n.id);

      // Optimistic update with new path
      set({ nodes: newNodes, selectedPath: newPath, _skipLoadNodes: true });

      try {
        // Send the NEW path to the server
        await send("nodes:reorder", { id: nodeId, beforeId, path: newPath });
      } catch {
        // Revert both nodes and path
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
