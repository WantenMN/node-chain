import { useEffect, useRef, useState } from "react";
import { ArrowDown, GitBranch, Link2, Plus } from "lucide-react";
import { useStore } from "../store/use-store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function InsertNode({ prevNode, beforeCreate }) {
  const connected = useStore((s) => s.connected);
  const createNode = useStore((s) => s.createNode);

  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const wrapperRef = useRef(null);
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

  if (active) {
    return (
      <div ref={wrapperRef} className="flex flex-col items-center py-2">
        <ArrowDown className="h-4 w-4 text-muted-foreground/30" />
        <div className="w-full rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 my-1 space-y-2">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Node content..."
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
