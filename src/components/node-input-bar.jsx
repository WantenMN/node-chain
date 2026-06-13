import { useEffect } from "react";
import { Send } from "lucide-react";
import { useStore } from "../store/use-store";
import { Button } from "./ui/button";

export function NodeInputBar({ inputRef }) {
  const input = useStore((s) => s.input);
  const setInput = useStore((s) => s.setInput);
  const connected = useStore((s) => s.connected);
  const submitting = useStore((s) => s._submitting);
  const appendNode = useStore((s) => s.appendNode);

  const disabled = !connected || submitting;

  // Reset textarea height when input is cleared (after submit)
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
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={submitting ? "Saving..." : connected ? "Append a node, press Enter..." : "Connecting..."}
            disabled={disabled}
            rows={1}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none overflow-hidden"
            style={{ height: "auto" }}
            onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
          />
          <Button size="icon" disabled={!input.trim() || disabled} onClick={appendNode}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
