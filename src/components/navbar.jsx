import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <Link2 className="h-5 w-5" />
          <span>Node Chain</span>
        </Link>
      </div>
    </header>
  );
}
