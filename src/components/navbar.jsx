import { Link, useMatches } from "@tanstack/react-router";
import { Link2, ArrowLeft } from "lucide-react";
import { useStore } from "../store/use-store";
import { cn } from "../lib/utils";

const STATUS_LABELS = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
};

function ConnectionDot() {
  const connected = useStore((s) => s.connected);
  const hasConnected = useStore((s) => s._hasConnected);

  const status = connected
    ? "connected"
    : hasConnected
      ? "disconnected"
      : "connecting";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60">
      <span className="relative flex h-2 w-2 shrink-0">
        {status === "connected" && (
          <span
            className="absolute inset-0 rounded-full bg-green-500"
            style={{ animation: "status-glow 2.5s ease-in-out infinite" }}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            status === "connected" && "bg-green-500",
            status === "connecting" && "bg-yellow-500",
            status === "disconnected" && "bg-red-500",
          )}
          style={{
            animation:
              status === "connected"
                ? "breathe 2.5s ease-in-out infinite"
                : status === "connecting"
                  ? "breathe 1.2s ease-in-out infinite"
                  : "breathe 2s ease-in-out infinite",
          }}
        />
      </span>
      <span className="text-xs font-medium text-muted-foreground">
        {STATUS_LABELS[status]}
      </span>
    </div>
  );
}

export function Navbar() {
  const matches = useMatches();
  const projects = useStore((s) => s.projects);

  // Check if we're on a project route
  const projectMatch = matches.find((m) => m.routeId === "/projects/$projectId");
  const projectId = projectMatch?.params?.projectId;
  const project = projectId ? projects.find((p) => p.id === Number(projectId)) : null;

  return (
    <header className="sticky top-0 z-50 shadow-[0_1px_0_var(--color-border)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4">
        {project ? (
          <Link to="/" className="flex items-center gap-2 font-bold group">
            <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">Projects</span>
            <span className="text-muted-foreground/40 mx-1">/</span>
            <span className="flex items-center gap-1.5">
              <Link2 className="h-5 w-5" />
              {project.name}
            </span>
          </Link>
        ) : (
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Link2 className="h-5 w-5" />
            <span>Node Chain</span>
          </Link>
        )}
        <div className="ml-auto">
          <ConnectionDot />
        </div>
      </div>
    </header>
  );
}
