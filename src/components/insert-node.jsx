import { useEffect, useRef, useState, memo } from "react";
import { GitBranch, Link2, Plus } from "lucide-react";
import { useStore } from "../store/use-store";
import { Button } from "./ui/button";

export const InsertNode = memo(function InsertNode({ prevNode, nextNode, beforeCreate }) {
  const createNode = useStore((s) => s.createNode);
  const hoveredNodeId = useStore((s) => s._hoveredNodeId);
  const draggedNodeId = useStore((s) => s._draggedNodeId);

  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const [hovered, setHovered] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const lastInsertedId = useRef(null);

  const isDragging = draggedNodeId != null;
  const showDropIndicator = (() => {
    if (hoveredNodeId == null || draggedNodeId == null) return false;
    if (hoveredNodeId === draggedNodeId) return false;
    const nodes = useStore.getState().nodes;
    const dragIdx = nodes.findIndex((n) => n.id === draggedNodeId);
    const hoverIdx = nodes.findIndex((n) => n.id === hoveredNodeId);
    if (dragIdx < 0 || hoverIdx < 0) return false;
    return (dragIdx < hoverIdx && prevNode?.id === hoveredNodeId) ||
           (dragIdx > hoverIdx && nextNode?.id === hoveredNodeId);
  })();

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setActive(false);
        setText("");
        lastInsertedId.current = null;
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [active]);

  function handleCreate(linked) {
    const trimmed = text.trim();
    if (!trimmed) return;
    beforeCreate?.();
    const afterId = lastInsertedId.current ?? prevNode.id;
    createNode({
      content: trimmed,
      parent_id: afterId,
      after_id: afterId,
      linked,
    }).then((node) => {
      if (node) lastInsertedId.current = node.id;
    });
    setText("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCreate(true);
    }
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      handleCreate(false);
    }
    if (e.key === "Escape") {
      setActive(false);
      setText("");
      lastInsertedId.current = null;
    }
  }

  // When inserting (active mode), render full-height
  if (active) {
    return (
      <div ref={wrapperRef} className="flex items-stretch">
        <div className="w-10 shrink-0" />
        <div className="relative w-8 shrink-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full border-2 border-dashed border-timeline-active bg-white shrink-0" />
        </div>
        <div className="flex-1 min-w-0 py-2 pr-1">
          <div className="ml-[6px]">
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.02] p-3 space-y-2.5">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Node content..."
                rows={1}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary resize-none overflow-hidden"
                style={{ height: "auto" }}
                onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!text.trim()} onClick={() => handleCreate(true)}>
                  <Link2 className="h-3 w-3" />
                  Insert
                </Button>
                <Button size="sm" variant="outline" disabled={!text.trim()} onClick={() => handleCreate(false)}>
                  <GitBranch className="h-3 w-3" />
                  New Branch
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setActive(false); setText(""); lastInsertedId.current = null; }}>
                  Cancel
                </Button>
                <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
                  Enter = insert, Shift+Enter = branch
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: zero-height, full-width hover/click zone
  return (
    <div
      className="relative overflow-visible select-none cursor-pointer flex"
      style={{ height: 0, paddingTop: 10, marginTop: -10 }}
      data-drop-insert="gap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { if (!isDragging) setActive(true); }}
    >
      {/* Spacer — matches index column width */}
      <div className="w-10 shrink-0" />
      {/* Plus icon on the timeline — opaque background covers the continuous line */}
      {!isDragging && (
        <div
          className="absolute pointer-events-none"
          style={{ left: 16, top: "50%", transform: "translate(-50%, -50%)", zIndex: 10 }}
        >
          <div
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-150 ${
              hovered
                ? "border-timeline-active bg-white scale-100 shadow-sm"
                : "border-transparent bg-transparent scale-75"
            }`}
          >
            <Plus
              className={`h-3 w-3 transition-colors duration-150 ${
                hovered ? "text-timeline-active" : "text-transparent"
              }`}
            />
          </div>
        </div>
      )}

      {/* Drop indicator — glowing line + pill */}
      {showDropIndicator && (
        <>
          <div className="absolute inset-x-0 h-[2px] bg-timeline-active shadow-[0_0_6px_var(--color-timeline-active)]" style={{ top: "50%", transform: "translateY(-50%)" }} />
          <div className="absolute flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-timeline-active text-white text-[11px] font-medium shadow-sm whitespace-nowrap" style={{ left: 64, top: "50%", transform: "translateY(-50%)" }}>
            <Plus className="h-3 w-3" />
            Drop here
          </div>
        </>
      )}
    </div>
  );
});
