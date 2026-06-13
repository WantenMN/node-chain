import { useRef, useCallback } from "react";
import { useStore } from "../store/use-store";

/**
 * Custom drag hook — replaces HTML5 drag API so wheel events work during drag.
 * Uses pointer events + elementFromPoint for hit testing.
 */
export function useDrag() {
  const dragState = useRef(null); // { nodeId, startX, startY, dragging, ghost }

  const startDrag = useCallback((e, nodeId, nodeContent) => {
    // Only left button
    if (e.button !== 0) return;
    e.preventDefault();

    dragState.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      ghost: null,
      lastTarget: null,
    };

    const onPointerMove = (ev) => {
      const ds = dragState.current;
      if (!ds) return;

      // Threshold before starting drag
      if (!ds.dragging) {
        const dx = ev.clientX - ds.startX;
        const dy = ev.clientY - ds.startY;
        if (dx * dx + dy * dy < 25) return; // 5px threshold

        ds.dragging = true;
        useStore.setState({ _draggedNodeId: ds.nodeId });

        // Create ghost
        const ghost = document.createElement("div");
        ghost.textContent = ds.nodeContent.slice(0, 40);
        ghost.style.cssText = `
          position:fixed;pointer-events:none;z-index:9999;
          padding:6px 12px;background:oklch(0.97 0.005 285.823);
          border:1px solid oklch(0.922 0.01 285.823);
          border-radius:8px;font-size:13px;font-family:Inter,system-ui,sans-serif;
          max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
          box-shadow:0 4px 12px rgba(0,0,0,0.1);
          transform:translate(12px,12px);
        `;
        document.body.appendChild(ghost);
        ds.ghost = ghost;
      }

      // Move ghost
      if (ds.ghost) {
        ds.ghost.style.left = ev.clientX + "px";
        ds.ghost.style.top = ev.clientY + "px";
      }

      // Find drop target
      if (ds.ghost) ds.ghost.style.display = "none";
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (ds.ghost) ds.ghost.style.display = "";

      // Walk up to find a [data-drop-*] attribute
      let target = el;
      let targetNodeId = null;
      let targetInsert = null;
      while (target && target !== document.body) {
        if (target.dataset.dropNode) {
          targetNodeId = Number(target.dataset.dropNode);
          break;
        }
        if (target.dataset.dropInsert) {
          targetInsert = target.dataset.dropInsert;
          break;
        }
        target = target.parentElement;
      }

      // Determine which node to highlight as the drop target
      const nodes = useStore.getState().nodes;
      const prev = useStore.getState()._hoveredNodeId;
      let newHover = prev; // keep previous by default

      if (targetNodeId !== null && targetNodeId !== ds.nodeId) {
        // Cursor is over a NodeCard
        newHover = targetNodeId;
      } else if (targetInsert === "top") {
        // Cursor is at the top drop zone → target first node
        newHover = nodes[0]?.id ?? null;
      } else if (targetInsert === "gap") {
        // Cursor is in the gap between two nodes.
        // The gap element is inside a wrapper div with data-node-index.
        // The gap between nodes[i-1] and nodes[i] is inside wrapper[i].
        const gapEl = target;
        const wrapper = gapEl.closest("[data-node-index]");
        if (wrapper) {
          const nodeIdx = Number(wrapper.dataset.nodeIndex);
          // Gap is between nodes[nodeIdx-1] and nodes[nodeIdx]
          // Use cursor Y to decide which node to target
          const gapRect = gapEl.getBoundingClientRect();
          const midY = gapRect.top + Math.max(gapRect.height, 20) / 2;
          if (ev.clientY < midY) {
            // Top half → target the node above the gap
            newHover = nodes[nodeIdx - 1]?.id ?? prev;
          } else {
            // Bottom half → target the node below the gap
            newHover = nodes[nodeIdx]?.id ?? prev;
          }
        }
      }
      // else: cursor is outside any valid zone → keep previous hover (don't clear)

      if (newHover !== prev) {
        useStore.setState({ _hoveredNodeId: newHover });
      }
    };

    const onPointerUp = () => {
      cleanup();
      const ds = dragState.current;
      if (!ds) return;
      dragState.current = null;

      if (ds.ghost) ds.ghost.remove();

      if (!ds.dragging) {
        // Was a click, not a drag
        useStore.setState({ _draggedNodeId: null, _hoveredNodeId: null });
        return;
      }

      const state = useStore.getState();
      const hoveredId = state._hoveredNodeId;
      useStore.setState({ _draggedNodeId: null, _hoveredNodeId: null });

      if (hoveredId != null && hoveredId !== ds.nodeId) {
        const allNodes = state.nodes;
        const dragIdx = allNodes.findIndex((n) => n.id === ds.nodeId);
        const hoverIdx = allNodes.findIndex((n) => n.id === hoveredId);
        const beforeId = dragIdx < hoverIdx
          ? (hoverIdx < allNodes.length - 1 ? allNodes[hoverIdx + 1].id : null)
          : hoveredId;
        useStore.getState().moveNode(ds.nodeId, beforeId);
      }
    };

    const onWheel = (ev) => {
      ev.preventDefault();
      window.scrollBy({ top: ev.deltaY, behavior: "auto" });
    };

    const onKeyDown = (ev) => {
      if (ev.key === "Escape") {
        cleanup();
        if (dragState.current?.ghost) dragState.current.ghost.remove();
        useStore.setState({ _draggedNodeId: null, _hoveredNodeId: null });
        dragState.current = null;
      }
    };

    // Auto-scroll
    let mouseY = e.clientY;
    let rafId = null;
    const EDGE = 80;
    const MAX_SPEED = 16;

    const trackMouse = (ev) => { mouseY = ev.clientY; };

    const tick = () => {
      const vh = window.innerHeight;
      let dy = 0;
      if (mouseY < EDGE) {
        dy = -Math.round((1 - mouseY / EDGE) * MAX_SPEED);
      } else if (mouseY > vh - EDGE) {
        dy = Math.round(((mouseY - (vh - EDGE)) / EDGE) * MAX_SPEED);
      }
      if (dy !== 0) window.scrollBy({ top: dy, behavior: "auto" });
      rafId = requestAnimationFrame(tick);
    };

    function cleanup() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointermove", trackMouse);
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(rafId);
    }

    // Store nodeContent for ghost
    dragState.current.nodeContent = nodeContent;

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointermove", trackMouse);
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKeyDown);
    rafId = requestAnimationFrame(tick);
  }, []);

  return { startDrag };
}
