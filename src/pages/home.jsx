import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "../store/use-store";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import {
  FolderOpen,
  Plus,
  GitBranch,
  Layers,
  Trash2,
  ArrowRight,
} from "lucide-react";

export function Home() {
  const navigate = useNavigate();
  const projects = useStore((s) => s.projects);
  const loading = useStore((s) => s.loading);
  const connected = useStore((s) => s.connected);
  const connect = useStore((s) => s.connect);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { connect(); }, [connect]);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const project = await createProject(name);
      setNewName("");
      setShowCreate(false);
      navigate({ to: "/projects/$projectId", params: { projectId: String(project.id) } });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteProject(id);
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="flex-1 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {connected ? `${projects.length} project${projects.length !== 1 ? "s" : ""}` : "Connecting…"}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} disabled={!connected}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Project
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6">
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="Project name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                className="max-w-sm"
              />
              <Button type="submit" disabled={!newName.trim() || creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setShowCreate(false); setNewName(""); }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-5 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20 space-y-4">
            <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">No projects yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Create your first project to get started.
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />
              Create Project
            </Button>
          </div>
        ) : (
          /* Project grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: String(project.id) } })}
                className="group relative border rounded-lg p-5 hover:border-foreground/25 hover:shadow-sm transition-all cursor-pointer"
              >
                {/* Project name */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-base truncate">{project.name}</h3>
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    disabled={deletingId === project.id}
                    className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                    title="Delete project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    {project.nodeCount} node{project.nodeCount !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3.5 w-3.5" />
                    {project.branchCount} branch{project.branchCount !== 1 ? "es" : ""}
                  </span>
                </div>

                {/* Date + arrow */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground/70">
                    {formatDate(project.created_at)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
