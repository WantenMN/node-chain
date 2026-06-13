import { useState, useRef, useEffect } from "react";
import { GitFork, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useStore } from "../store/use-store";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Popover, PopoverHeader, PopoverTitle, PopoverDescription } from "./ui/popover";

function ForkPopover({ nodeId, selectedPath, onSelectBranch, open, onOpenChange, anchorEl }) {
  const send = useStore((s) => s.send);
  const [childBranches, setChildBranches] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
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

  useEffect(() => {
    if (!open) {
      setLoaded(false);
      setChildBranches([]);
    }
  }, [open]);

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
  const moveNode = useStore((s) => s.moveNode);
  const selectPath = useStore((s) => s.selectPath);
  const selectedPath = useStore((s) => s.selectedPath);

  const [showFork, setShowFork] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const triggerRef = useRef(null);
  const editRef = useRef(null);

  // Edit mode
  function startEdit() {
    setEditText(node.content);
    setEditing(true);
  }

  useEffect(() => {
    if (!editing || !editRef.current) return;
    const el = editRef.current;
    el.focus();
    // Move cursor to end
    el.setSelectionRange(el.value.length, el.value.length);
    // Auto-resize to fit full content
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

  // Drag
  function handleDragStart(e) {
    e.dataTransfer.setData("text/plain", String(node.id));
    e.dataTransfer.effectAllowed = "move";
    useStore.setState({ _draggedNodeId: node.id });
    const card = e.currentTarget.closest("[data-card]");
    if (card) {
      const clone = card.cloneNode(true);
      clone.style.opacity = "0.5";
      clone.style.position = "absolute";
      clone.style.top = "-9999px";
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, 20, 20);
      requestAnimationFrame(() => clone.remove());
    }
  }

  function handleDragEnd() {
    useStore.setState({ _draggedNodeId: null, _hoveredNodeId: null });
  }

  function handleCardDragOver(e) {
    const draggedId = useStore.getState()._draggedNodeId;
    if (draggedId === node.id || draggedId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    useStore.setState({ _hoveredNodeId: node.id });
  }

  function handleCardDragLeave(e) {
    // Only clear if mouse actually left the card (not just moved to a child element)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      useStore.setState({ _hoveredNodeId: null });
    }
  }

  function handleCardDrop(e) {
    e.preventDefault();
    const state = useStore.getState();
    useStore.setState({ _draggedNodeId: null, _hoveredNodeId: null });
    const draggedId = Number(e.dataTransfer.getData("text/plain"));
    if (draggedId === node.id) return;
    const allNodes = state.nodes;
    const dragIdx = allNodes.findIndex((n) => n.id === draggedId);
    const hoverIdx = allNodes.findIndex((n) => n.id === node.id);
    // Dragging down → insert after hovered node; dragging up → insert before
    const beforeId = dragIdx < hoverIdx
      ? (hoverIdx < allNodes.length - 1 ? allNodes[hoverIdx + 1].id : null)
      : node.id;
    moveNode(draggedId, beforeId);
  }

  return (
    <>
      <Card
        data-card
        className="group relative flex items-start gap-3 p-4 hover:shadow-md transition-shadow"
        onDragOver={handleCardDragOver}
        onDragLeave={handleCardDragLeave}
        onDrop={handleCardDrop}
      >
        {/* Drag handle — full height */}
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className="flex items-center self-stretch opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground -ml-1"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={1}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none overflow-hidden"
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
                className="text-sm leading-relaxed break-words cursor-text"
                onDoubleClick={startEdit}
                title="Double-click to edit"
              >
                {node.content}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                {isFork && (
                  <Badge
                    ref={triggerRef}
                    variant="secondary"
                    className="gap-0.5 cursor-pointer hover:bg-amber-100 text-amber-700"
                    onClick={() => setShowFork((v) => !v)}
                  >
                    <GitFork className="h-3 w-3" />
                    Branches
                  </Badge>
                )}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!editing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={startEdit}
              title="Edit node"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => deleteNode(node.id)}
            title="Delete node"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {isFork && (
        <ForkPopover
          nodeId={node.id}
          selectedPath={selectedPath}
          onSelectBranch={selectPath}
          open={showFork}
          onOpenChange={setShowFork}
          anchorEl={triggerRef.current}
        />
      )}
    </>
  );
}
