import { useStore } from "../store/use-store";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { GitBranch, GitFork } from "lucide-react";

export function BranchSidebar() {
  const branches = useStore((s) => s.branches);
  const selectedLeafId = useStore((s) => s.selectedLeafId);
  const selectBranch = useStore((s) => s.selectBranch);
  const forkNodeIds = useStore((s) => s._forkNodeIds);
  const scrollToForkPoint = useStore((s) => s.scrollToForkPoint);

  const hasForkPoints = forkNodeIds.size > 0;

  return (
    <aside className="w-64 shrink-0 border-r hidden md:flex flex-col sticky top-14 h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between px-3 pt-4 pb-3 shrink-0">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          Branches ({branches.length})
        </h2>
        {hasForkPoints && (
          <button
            onClick={scrollToForkPoint}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-accent"
            title="Jump to fork point"
          >
            <GitFork className="h-3 w-3" />
            Fork point
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto px-3 pb-4 space-y-1">
        {branches.map((branch) => {
          const isSelected = branch.branchId === selectedLeafId;
          return (
            <Button
              key={branch.branchId}
              variant={isSelected ? "default" : "ghost"}
              className="w-full justify-start h-auto py-2 px-3"
              onClick={() => selectBranch(branch.branchId)}
            >
              <div className="text-left min-w-0">
                <div className="font-medium truncate text-sm">{branch.preview}</div>
                <div className={`text-xs mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {branch.count} node{branch.count !== 1 ? "s" : ""}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </aside>
  );
}

export function MobileBranchSelect() {
  const branches = useStore((s) => s.branches);
  const selectedLeafId = useStore((s) => s.selectedLeafId);
  const selectBranch = useStore((s) => s.selectBranch);
  const forkNodeIds = useStore((s) => s._forkNodeIds);
  const scrollToForkPoint = useStore((s) => s.scrollToForkPoint);

  const hasForkPoints = forkNodeIds.size > 0;

  return (
    <div className="md:hidden mb-4 space-y-2">
      <Select
        value={selectedLeafId ?? ""}
        onChange={(e) => {
          const leafId = Number(e.target.value);
          if (leafId) selectBranch(leafId);
        }}
      >
        {branches.map((b) => (
          <option key={b.branchId} value={b.branchId}>
            {b.preview} ({b.count} nodes)
          </option>
        ))}
      </Select>
      {hasForkPoints && (
        <button
          onClick={scrollToForkPoint}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <GitFork className="h-3.5 w-3.5" />
          Jump to fork point
        </button>
      )}
    </div>
  );
}
