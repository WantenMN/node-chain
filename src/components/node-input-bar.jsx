import { useEffect } from "react";
import { CornerDownLeft } from "lucide-react";
import { useStore } from "../store/use-store";

export function NodeInputBar({ inputRef }) {
  const input = useStore((s) => s.input);
  const setInput = useStore((s) => s.setInput);
  const connected = useStore((s) => s.connected);
  const submitting = useStore((s) => s._submitting);
  const appendNode = useStore((s) => s.appendNode);

  const disabled = !connected || submitting;

  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [input, inputRef]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      appendNode();
    }
  }

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={submitting ? "Saving..." : connected ? "Append a node..." : "Connecting..."}
            disabled={disabled}
            rows={1}
            className="flex w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary focus:bg-background resize-none overflow-hidden"
            style={{ height: "auto" }}
            onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
          />
          <button
            disabled={!input.trim() || disabled}
            onClick={appendNode}
            className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
            title="Append node (Enter)"
          >
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-1.5 ml-1">
          Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> to append
        </p>
      </div>
    </div>
  );
}
