import { useEffect, useRef, useMemo, useState } from "react";
import { Link2, Plus } from "lucide-react";
import { useStore } from "../store/use-store";
import { InsertNode } from "../components/insert-node";
import { NodeCard } from "../components/node-card";
import { BranchSidebar, MobileBranchSelect } from "../components/branch-sidebar";
import { NodeInputBar } from "../components/node-input-bar";
import { Skeleton } from "../components/ui/skeleton";

function TopDropZone() {
  const moveNode = useStore((s) => s.moveNode);
  const nodes = useStore((s) => s.nodes);
  const hoveredNodeId = useStore((s) => s._hoveredNodeId);
  const draggedNodeId = useStore((s) => s._draggedNodeId);

  // Show when dragging down to the first node (hovered is first, dragged is above it)
  const showIndicator = hoveredNodeId === nodes[0]?.id && draggedNodeId != null &&
    (() => {
      const dragIdx = nodes.findIndex((n) => n.id === draggedNodeId);
      return dragIdx > 0;
    })();

  function handleDrop(e) {
    e.preventDefault();
    useStore.setState({ _draggedNodeId: null, _hoveredNodeId: null });
    const draggedId = Number(e.dataTransfer.getData("text/plain"));
    moveNode(draggedId, nodes[0]?.id ?? null);
  }

  if (!showIndicator) return <div className="h-4" />;

  return (
    <div
      className="flex items-center justify-center h-10 rounded-lg border-2 border-dashed border-primary bg-primary/5 mx-4"
      onDrop={handleDrop}
    >
      <Plus className="h-4 w-4 text-primary" />
      <span className="text-xs text-primary font-medium ml-1.5">Insert here</span>
    </div>
  );
}


export function Home() {
  const bottomInputRef = useRef(null);
  const anchorRef = useRef(null);

  const branches = useStore((s) => s.branches);
  const selectedPath = useStore((s) => s.selectedPath);
  const nodes = useStore((s) => s.nodes);
  const loading = useStore((s) => s.loading);
  const connected = useStore((s) => s.connected);
  const connect = useStore((s) => s.connect);
  const loadNodes = useStore((s) => s.loadNodes);
  const selectPath = useStore((s) => s.selectPath);
  const getForkPoints = useStore((s) => s.getForkPoints);

  // Connect WebSocket on mount
  useEffect(() => { connect(); }, [connect]);

  // Load nodes when selected path changes
  useEffect(() => {
    if (!connected || selectedPath.length === 0) return;

    if (useStore.getState()._skipLoadNodes) {
      useStore.setState({ _skipLoadNodes: false });
      return;
    }

    snapshotAnchor();

    loadNodes(selectedPath).then(() => {
      if (useStore.getState()._shouldFocusBottom) {
        useStore.setState({ _shouldFocusBottom: false });
        bottomInputRef.current?.focus();
      }
    });
  }, [selectedPath, connected, loadNodes]);

  function snapshotAnchor() {
    const focused = document.activeElement;
    if (focused && focused.tagName === "INPUT") {
      anchorRef.current = { el: focused, top: focused.getBoundingClientRect().top };
    }
  }

  // Scroll anchor: compensate so the input stays in place after node insert
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor?.el) return;
    anchorRef.current = null;
    requestAnimationFrame(() => {
      const newTop = anchor.el.getBoundingClientRect().top;
      const delta = newTop - anchor.top;
      if (Math.abs(delta) > 1) window.scrollBy(0, delta);
    });
  }, [nodes]);

  // Scroll to bottom and refocus input after appendNode
  useEffect(() => {
    if (useStore.getState()._scrollToBottom) {
      useStore.setState({ _scrollToBottom: false });
      requestAnimationFrame(() => {
        window.scrollTo(0, document.body.scrollHeight);
        bottomInputRef.current?.focus();
      });
    }
  }, [nodes]);

  const forkPoints = useMemo(() => getForkPoints(), [branches]);
  const parentId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;

  return (
    <div className="flex">
      {/* Sidebar: sticky below navbar */}
      <BranchSidebar />

      {/* Content area */}
      <div className="flex-1 min-w-0 px-4 py-6 pb-28">
        <div className="max-w-2xl mx-auto">
          <MobileBranchSelect />

          {loading ? (
            <div className="space-y-4 py-20">
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Link2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">No nodes yet. Type below to start a chain.</p>
            </div>
          ) : (
            <div>
              {nodes.length > 0 && <TopDropZone />}
              {nodes.map((node, i) => (
                <div key={node.id}>
                  {i > 0 && <InsertNode prevNode={nodes[i - 1]} nextNode={node} beforeCreate={snapshotAnchor} />}
                  <NodeCard
                    node={node}
                    index={i + 1}
                    isFork={forkPoints.has(node.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom input bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="md:ml-64">
          <NodeInputBar inputRef={bottomInputRef} />
        </div>
      </div>
    </div>
  );
}
