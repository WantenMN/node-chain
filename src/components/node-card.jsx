import { useState, useRef, useEffect } from "react";
import { GitBranch, GitFork, Link2, Trash2 } from "lucide-react";
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
  const getDisplayIndex = useStore((s) => s.getDisplayIndex);
  const deleteNode = useStore((s) => s.deleteNode);
  const selectPath = useStore((s) => s.selectPath);
  const selectedPath = useStore((s) => s.selectedPath);

  const [showFork, setShowFork] = useState(false);
  const triggerRef = useRef(null);

  const parentIndex = getDisplayIndex(node.parent_id);

  return (
    <>
      <Card className="group relative flex items-start gap-3 p-4 hover:shadow-md transition-shadow">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed break-words">{node.content}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <span>{new Date(node.created_at + "Z").toLocaleString()}</span>
            {node.parent_id != null ? (
              <Badge variant="outline" className="gap-0.5">
                <Link2 className="h-3 w-3" />
                linked to #{parentIndex}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-0.5">
                <GitBranch className="h-3 w-3" />
                root
              </Badge>
            )}
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
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => deleteNode(node.id)}
          title="Delete node"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
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
