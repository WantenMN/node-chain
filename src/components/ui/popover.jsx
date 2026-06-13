import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export function Popover({ open, onOpenChange, anchorEl, children, className }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, flip: false });

  useEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < 260; // not enough room below → open upward
    setPos({
      top: flip ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      flip,
    });
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !anchorEl?.contains(e.target)) {
        onOpenChange(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onOpenChange, anchorEl]);

  if (!open) return null;

  return createPortal(
    <div
      ref={ref}
      className={cn(
        "fixed z-50 bg-background rounded-xl border shadow-xl overflow-hidden",
        "animate-popover-in",
        className
      )}
      style={{
        top: pos.flip ? "auto" : pos.top,
        bottom: pos.flip ? window.innerHeight - pos.top : "auto",
        left: pos.left,
        transformOrigin: pos.flip ? "bottom left" : "top left",
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export function PopoverHeader({ className, ...props }) {
  return <div className={cn("px-4 pt-4 pb-2", className)} {...props} />;
}

export function PopoverTitle({ className, ...props }) {
  return <h3 className={cn("text-sm font-semibold leading-none", className)} {...props} />;
}

export function PopoverDescription({ className, ...props }) {
  return <p className={cn("text-xs text-muted-foreground mt-1", className)} {...props} />;
}
