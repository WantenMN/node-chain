import { Send } from "lucide-react";
import { useStore } from "../store/use-store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function NodeInputBar({ inputRef, parentIndex }) {
  const input = useStore((s) => s.input);
  const setInput = useStore((s) => s.setInput);
  const connected = useStore((s) => s.connected);
  const submitting = useStore((s) => s._submitting);
  const appendNode = useStore((s) => s.appendNode);

  const disabled = !connected || submitting;

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
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={submitting ? "Saving..." : connected ? "Append a node, press Enter..." : "Connecting..."}
            disabled={disabled}
          />
          <Button size="icon" disabled={!input.trim() || disabled} onClick={appendNode}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {parentIndex != null && (
          <p className="text-xs text-muted-foreground mt-1.5 pl-1">
            &rarr; Will link to #{parentIndex}
          </p>
        )}
      </div>
    </div>
  );
}
