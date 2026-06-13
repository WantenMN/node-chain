import { useStore } from "../store/use-store";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { GitBranch } from "lucide-react";

export function BranchSidebar() {
  const branches = useStore((s) => s.branches);
  const selectedLeafId = useStore((s) => s.selectedLeafId);
  const selectBranch = useStore((s) => s.selectBranch);

  return (
    <aside className="w-64 shrink-0 border-r py-4 px-3 hidden md:block sticky top-14 h-[calc(100vh-3.5rem)] overflow-auto">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5" />
        Branches ({branches.length})
      </h2>
      <div className="space-y-1">
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

  return (
    <div className="md:hidden mb-4">
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
    </div>
  );
}
