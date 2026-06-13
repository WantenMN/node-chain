import { useState, useRef, useEffect } from "react";
import { GitFork, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useStore } from "../store/use-store";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Popover, PopoverHeader, PopoverTitle, PopoverDescription } from "./ui/popover";
import { useDrag } from "../lib/use-drag";

function ForkPopover({ nodeId, selectedPath, onSelectBranch, open, onOpenChange, anchorEl }) {
  const send = useStore((s) => s.send);
  const [childBranches, setChildBranches] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        setLoaded(false);
        setChildBranches([]);
      }, 0);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    send("branches:from", { nodeId }).then((data) => {
      if (cancelled) return;
      data.sort((a, b) => {
        const aMax = Math.max(...a.branches.map((p) => p.count));
        const bMax = Math.max(...b.branches.map((p) => p.count));
        return bMax - aMax;
      });
      setChildBranches(data);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, nodeId, send]);

  function pickLongest(paths) {
    return paths.reduce((best, p) => (p.count > best.count ? p : best), paths[0]);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} anchorEl={anchorEl} className="w-72">
      <PopoverHeader>
        <PopoverTitle>Branches</PopoverTitle>
        <PopoverDescription>Select a child node to switch branch</PopoverDescription>
      </PopoverHeader>
      <div className="px-3 pb-3 space-y-0.5 max-h-60 overflow-auto">
        {!loaded ? (
          <div className="space-y-1.5 py-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg px-3 py-2.5">
                <Skeleton className="h-3.5 w-3/4 mb-1.5" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            ))}
          </div>
        ) : childBranches.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No child nodes</p>
        ) : (
          childBranches.map(({ child, branches }) => {
            const best = pickLongest(branches);
            const selected = best.path.every((id, i) => id === selectedPath[i]);
            return (
              <Button
                key={child.id}
                variant={selected ? "default" : "ghost"}
                className="w-full justify-start h-auto py-2.5 px-3"
                onClick={() => onSelectBranch(best.path)}
              >
                <div className="text-left min-w-0">
                  <div className="font-medium truncate leading-snug text-sm">{child.content}</div>
                  <div className={`text-xs mt-0.5 ${selected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {best.count} nodes
                  </div>
                </div>
              </Button>
            );
          })
        )}
      </div>
    </Popover>
  );
}

export function NodeCard({ node, index, isFork }) {
  const deleteNode = useStore((s) => s.deleteNode);
  const updateNode = useStore((s) => s.updateNode);
  const selectPath = useStore((s) => s.selectPath);
  const selectedPath = useStore((s) => s.selectedPath);
  const draggedNodeId = useStore((s) => s._draggedNodeId);
  const hoveredNodeId = useStore((s) => s._hoveredNodeId);

  const [showFork, setShowFork] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [hovered, setHovered] = useState(false);
  const [forkAnchorEl, setForkAnchorEl] = useState(null);
  const editRef = useRef(null);

  const { startDrag } = useDrag();

  function startEdit() {
    setEditText(node.content);
    setEditing(true);
  }

  useEffect(() => {
    if (!editing || !editRef.current) return;
    const el = editRef.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    requestAnimationFrame(() => {
      if (editRef.current) {
        editRef.current.style.height = "auto";
        editRef.current.style.height = editRef.current.scrollHeight + "px";
      }
    });
  }, [editing]);

  function saveEdit() {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== node.content) updateNode(node.id, trimmed);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setEditText("");
  }

  function handleEditKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  }

  const isDragging = draggedNodeId === node.id;
  const isDropTarget = hoveredNodeId === node.id && draggedNodeId != null && !isDragging;

  return (
    <>
      <div
        className="group relative flex items-stretch"
        data-drop-node={node.id}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Rail column: dot aligned to first line of text */}
        <div className="relative w-8 shrink-0">
          <div
            className="absolute z-10"
            style={{ left: 16, top: 22, transform: "translate(-50%, -50%)" }}
          >
            <div
              className={`w-3 h-3 rounded-full border-2 transition-all duration-200 ${
                isDragging
                  ? "border-muted-foreground/30 bg-muted scale-75 opacity-50"
                  : isDropTarget
                    ? "border-timeline-active bg-timeline-active/20 scale-110"
                    : isFork
                      ? "border-timeline-fork bg-timeline-fork/20"
                      : hovered
                        ? "border-timeline-dot-hover bg-white scale-110"
                        : "border-timeline-dot bg-white"
              }`}
            >
              {hovered && !editing && !isDragging && (
                <span
                  className="absolute inset-0 rounded-full bg-timeline-dot-hover/30"
                  style={{ animation: "dot-pulse 1.5s ease-in-out infinite" }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className={`flex-1 min-w-0 pt-3 pb-3 pr-1 ${isDragging ? "opacity-40" : ""}`}>
          <div className="flex items-start gap-2">
            {/* Index number */}
            <span className="text-[11px] font-mono text-muted-foreground/50 mt-[3px] w-5 shrink-0 text-right select-none">
              {index}
            </span>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    ref={editRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    rows={1}
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary resize-none overflow-hidden"
                    style={{ height: "auto" }}
                    onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" disabled={!editText.trim()} onClick={saveEdit}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    <span className="text-xs text-muted-foreground ml-auto">Enter = save, Esc = cancel</span>
                  </div>
                </div>
              ) : (
                <>
                  <p
                    className="text-sm leading-relaxed break-words cursor-text select-text"
                    onDoubleClick={startEdit}
                    title="Double-click to edit"
                  >
                    {node.content}
                  </p>
                  {isFork && (
                    <button
                      ref={setForkAnchorEl}
                      className="inline-flex items-center gap-1 mt-1 -ml-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
                      onClick={() => setShowFork((v) => !v)}
                    >
                      <GitFork className="h-3 w-3" />
                      <span>branches</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Actions — shown on hover */}
            {!editing && (
              <div
                className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ${
                  hovered && !isDragging ? "opacity-100" : "opacity-0"
                }`}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={startEdit}
                  title="Edit node"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => deleteNode(node.id)}
                  title="Delete node"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <div
                  className="flex items-center justify-center h-7 w-7 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                  title="Drag to reorder"
                  onPointerDown={(e) => startDrag(e, node.id, node.content)}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isFork && (
        <ForkPopover
          nodeId={node.id}
          selectedPath={selectedPath}
          onSelectBranch={selectPath}
          open={showFork}
          onOpenChange={setShowFork}
          anchorEl={forkAnchorEl}
        />
      )}
    </>
  );
}
