import { useEffect, useRef, useState } from "react";
import { ArrowDown, GitBranch, Link2, Plus } from "lucide-react";
import { useStore } from "../store/use-store";
import { Button } from "./ui/button";

export function InsertNode({ prevNode, nextNode, beforeCreate }) {
  const connected = useStore((s) => s.connected);
  const createNode = useStore((s) => s.createNode);
  const moveNode = useStore((s) => s.moveNode);
  const hoveredNodeId = useStore((s) => s._hoveredNodeId);
  const draggedNodeId = useStore((s) => s._draggedNodeId);
  const nodes = useStore((s) => s.nodes);

  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const wrapperRef = useRef(null);

  // Determine direction by comparing dragged and hovered positions in the list
  const showDropIndicator = (() => {
    if (hoveredNodeId == null || draggedNodeId == null) return false;
    if (hoveredNodeId === draggedNodeId) return false;
    const dragIdx = nodes.findIndex((n) => n.id === draggedNodeId);
    const hoverIdx = nodes.findIndex((n) => n.id === hoveredNodeId);
    if (dragIdx < 0 || hoverIdx < 0) return false;
    // Dragging down (dragIdx < hoverIdx): indicator below hovered → this gap if prevNode is hovered
    // Dragging up (dragIdx > hoverIdx): indicator above hovered → this gap if nextNode is hovered
    return (dragIdx < hoverIdx && prevNode?.id === hoveredNodeId) ||
           (dragIdx > hoverIdx && nextNode?.id === hoveredNodeId);
  })();
  const inputRef = useRef(null);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setActive(false);
        setText("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [active]);

  function handleCreate(linked) {
    const trimmed = text.trim();
    if (!trimmed) return;
    beforeCreate?.();
    createNode({
      content: trimmed,
      parent_id: prevNode.id,
      after_id: prevNode.id,
      linked,
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
    }
  }

  // Drop handling
  function handleDrop(e) {
    e.preventDefault();
    useStore.setState({ _dropTarget: null, _draggedNodeId: null });
    const draggedId = Number(e.dataTransfer.getData("text/plain"));
    moveNode(draggedId, nextNode?.id ?? null);
  }

  if (active) {
    return (
      <div ref={wrapperRef} className="flex flex-col items-center py-2">
        <ArrowDown className="h-4 w-4 text-muted-foreground/30" />
        <div className="w-full rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 my-1 space-y-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Node content..."
            rows={1}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none overflow-hidden"
            style={{ height: "auto" }}
            onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!text.trim()} onClick={() => handleCreate(true)}>
              <Link2 className="h-3 w-3" />
              Linked
            </Button>
            <Button size="sm" variant="outline" disabled={!text.trim()} onClick={() => handleCreate(false)}>
              <GitBranch className="h-3 w-3" />
              Branch
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setActive(false); setText(""); }}>
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Enter = linked, Shift+Enter = branch
            </span>
          </div>
        </div>
        <ArrowDown className="h-4 w-4 text-muted-foreground/30" />
      </div>
    );
  }

  if (showDropIndicator) {
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

  return (
    <div
      className="group/insert flex items-center justify-center h-10 cursor-pointer select-none"
      onClick={() => setActive(true)}
      title="Insert node here"
    >
      <ArrowDown className="h-4 w-4 text-muted-foreground/30 group-hover/insert:hidden" />
      <Plus className="h-4 w-4 text-primary hidden group-hover/insert:block" />
    </div>
  );
}
