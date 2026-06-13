import { useEffect, useRef, useMemo, useCallback } from "react";
import { Link2, Plus, ChevronsUp, ChevronsDown } from "lucide-react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "../store/use-store";
import { InsertNode } from "../components/insert-node";
import { NodeCard } from "../components/node-card";
import { BranchSidebar, MobileBranchSelect } from "../components/branch-sidebar";
import { NodeInputBar } from "../components/node-input-bar";
import { Skeleton } from "../components/ui/skeleton";

function TopDropZone() {
  const nodes = useStore((s) => s.nodes);
  const hoveredNodeId = useStore((s) => s._hoveredNodeId);
  const draggedNodeId = useStore((s) => s._draggedNodeId);
  const isDragging = draggedNodeId != null;

  const showIndicator = hoveredNodeId === nodes[0]?.id && isDragging &&
    (() => {
      const dragIdx = nodes.findIndex((n) => n.id === draggedNodeId);
      return dragIdx > 0;
    })();

  return (
    <div
      className="relative h-0 overflow-visible"
      data-drop-insert="top"
    >
      {showIndicator && (
        <>
          <div className="absolute inset-x-0 h-[2px] bg-timeline-active shadow-[0_0_6px_var(--color-timeline-active)]" style={{ top: 0 }} />
          <div className="absolute flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-timeline-active text-white text-[11px] font-medium shadow-sm whitespace-nowrap" style={{ left: 64, top: 0 }}>
            <Plus className="h-3 w-3" />
            Drop here
          </div>
        </>
      )}
    </div>
  );
}


export function ProjectPage({ projectId }) {
  const bottomInputRef = useRef(null);
  const anchorRef = useRef(null);

  const branches = useStore((s) => s.branches);
  const selectedPath = useStore((s) => s.selectedPath);
  const nodes = useStore((s) => s.nodes);
  const loading = useStore((s) => s.loading);
  const connected = useStore((s) => s.connected);
  const connect = useStore((s) => s.connect);
  const setCurrentProject = useStore((s) => s.setCurrentProject);
  const loadNodes = useStore((s) => s.loadNodes);
  const getForkPoints = useStore((s) => s.getForkPoints);
  const forkNodeIds = useStore((s) => s._forkNodeIds);

  // Virtualizer — only renders nodes visible in the viewport.
  // Chromium caps element height at ~33,554,432px. With 72px estimate,
  // ~466k nodes is the limit before clipping. Scale estimate dynamically.
  const MAX_CONTAINER_HEIGHT = 33554432;
  const virtualizer = useWindowVirtualizer({
    count: nodes.length,
    estimateSize: useCallback(() => {
      const maxEstimate = Math.floor(MAX_CONTAINER_HEIGHT / Math.max(nodes.length, 1));
      return Math.min(72, maxEstimate);
    }, [nodes.length]),
    overscan: 5,
    measureElement: useCallback((el) => el.getBoundingClientRect().height, []),
    getItemKey: useCallback((index) => nodes[index]?.id ?? index, [nodes]),
  });

  // Connect WebSocket on mount and set current project
  useEffect(() => { connect(); }, [connect]);
  useEffect(() => {
    if (connected && projectId != null) {
      setCurrentProject(Number(projectId));
    }
  }, [connected, projectId, setCurrentProject]);

  // Load nodes when selected path changes (guard: selectBranch already loads nodes)
  useEffect(() => {
    if (!connected || selectedPath.length === 0) return;

    if (useStore.getState()._skipLoadNodes) {
      useStore.setState({ _skipLoadNodes: false });
      return;
    }

    snapshotAnchor();
  }, [selectedPath, connected, loadNodes]);

  function snapshotAnchor() {
    const focused = document.activeElement;
    if (focused && (focused.tagName === "INPUT" || focused.tagName === "TEXTAREA")) {
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
        virtualizer.scrollToIndex(nodes.length - 1, { align: "end" });
        bottomInputRef.current?.focus();
      });
    }
  }, [nodes, virtualizer]);

  const forkPoints = useMemo(() => getForkPoints(), [forkNodeIds, getForkPoints]);

  const nodeIndexMap = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < nodes.length; i++) map.set(nodes[i].id, i);
    return map;
  }, [nodes]);

  return (
    <div className="flex">
      {/* Sidebar */}
      <BranchSidebar />

      {/* Content area */}
      <div className="flex-1 min-w-0 px-4 py-6 pb-28">
        <div className="max-w-2xl mx-auto">
          <MobileBranchSelect />

          {loading ? (
            <div className="space-y-6 py-20 ml-[18px]">
              <div className="flex items-center gap-4">
                <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Link2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">No nodes yet. Type below to start a chain.</p>
            </div>
          ) : (
            /* Timeline container — virtualized */
            <div className="relative">
              {/* Continuous line — behind everything, spans full virtual height.
                  Left offset = index column (w-10 = 40px) + rail dot offset (16px) */}
              <div
                className="absolute top-0 w-px bg-timeline pointer-events-none"
                style={{ left: 56, zIndex: 0, height: virtualizer.getTotalSize() }}
              />

              <TopDropZone />

              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const i = virtualRow.index;
                  const node = nodes[i];
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      data-node-index={i}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {i > 0 && (
                        <InsertNode
                          prevNode={nodes[i - 1]}
                          nextNode={node}
                          prevIndex={i - 1}
                          nodeIndexMap={nodeIndexMap}
                          beforeCreate={snapshotAnchor}
                        />
                      )}
                      <NodeCard
                        node={node}
                        index={i + 1}
                        isFork={forkPoints.has(node.id)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Tail space */}
              <div className="h-8" />
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom input bar — content area only */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 z-40">
        <NodeInputBar inputRef={bottomInputRef} />
      </div>

      {/* Scroll navigation buttons */}
      {nodes.length > 0 && (
        <div className="fixed right-4 bottom-24 z-30 flex flex-col gap-1">
          <button
            onClick={() => virtualizer.scrollToIndex(0, { align: "start" })}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Jump to top"
          >
            <ChevronsUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => virtualizer.scrollToIndex(nodes.length - 1, { align: "end" })}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Jump to bottom"
          >
            <ChevronsDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
