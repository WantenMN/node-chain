import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export function Dialog({ open, onOpenChange, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onOpenChange(false);
      }}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative z-50 w-full max-w-lg">{children}</div>
    </div>
  );
}

export function DialogContent({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "bg-background rounded-xl border shadow-xl p-0 animate-in fade-in-0 zoom-in-95 duration-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ className, ...props }) {
  return (
    <div className={cn("px-6 pt-6 pb-4", className)} {...props} />
  );
}

export function DialogTitle({ className, ...props }) {
  return (
    <h2 className={cn("text-base font-semibold leading-none", className)} {...props} />
  );
}

export function DialogDescription({ className, ...props }) {
  return (
    <p className={cn("text-sm text-muted-foreground mt-1.5", className)} {...props} />
  );
}

export function DialogClose({ onClose, className }) {
  return (
    <button
      onClick={onClose}
      className={cn(
        "absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity",
        className
      )}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
