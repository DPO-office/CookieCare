import { useEffect, type RefObject } from "react";

const TABLE_WRAP_SELECTOR = ".md-table-wrap";

type ScrollEdge = "left" | "right" | "both";

function updateTableScrollEdge(wrap: HTMLElement) {
  const threshold = 3;
  const hasOverflow = wrap.scrollWidth - wrap.clientWidth > threshold;
  if (!hasOverflow) {
    delete wrap.dataset.scroll;
    return;
  }

  const hasLeft = wrap.scrollLeft > threshold;
  const hasRight =
    wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft > threshold;
  const edge: ScrollEdge | undefined = hasLeft
    ? hasRight
      ? "both"
      : "left"
    : hasRight
      ? "right"
      : undefined;

  if (edge) wrap.dataset.scroll = edge;
  else delete wrap.dataset.scroll;
}

/**
 * Fixes touchpad scroll jank on long report pages:
 * - Forwards vertical wheel from nested table horizontal scrollers to the main panel
 * - Marks the container while scrolling to skip expensive hover repaints
 */
export function useReportScroll(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let scrollEndTimer: ReturnType<typeof setTimeout> | undefined;
    const tableListeners = new Map<HTMLElement, () => void>();

    const wireTableScrollEdges = () => {
      root.querySelectorAll<HTMLElement>(TABLE_WRAP_SELECTOR).forEach((wrap) => {
        if (!tableListeners.has(wrap)) {
          const update = () => updateTableScrollEdge(wrap);
          wrap.addEventListener("scroll", update, { passive: true });
          tableListeners.set(wrap, update);
        }
        updateTableScrollEdge(wrap);
      });
    };

    const onScroll = () => {
      root.classList.add("is-scrolling");
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => {
        root.classList.remove("is-scrolling");
      }, 120);
    };

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const wrap = target.closest<HTMLElement>(TABLE_WRAP_SELECTOR);
      if (!wrap || !root.contains(wrap)) return;

      // Horizontal-dominant gesture (trackpad sideways / shift+wheel): let the
      // table's own horizontal scroller handle it, don't touch the page.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      // Vertical-dominant gesture: ALWAYS drive the page. A horizontal-only
      // scroll container (the table wrap) otherwise traps the vertical wheel
      // mid-scroll and the whole page appears frozen while the cursor is over
      // the table. Forwarding unconditionally keeps page scroll working
      // everywhere; the table only ever moves on a real sideways gesture.
      if (e.deltaY !== 0) {
        root.scrollTop += e.deltaY;
        e.preventDefault();
      }
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("wheel", onWheel, { passive: false });

    const mutationObserver = new MutationObserver(wireTableScrollEdges);
    mutationObserver.observe(root, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(wireTableScrollEdges);
    resizeObserver.observe(root);
    wireTableScrollEdges();

    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", onWheel);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      tableListeners.forEach((listener, wrap) => {
        wrap.removeEventListener("scroll", listener);
        delete wrap.dataset.scroll;
      });
      tableListeners.clear();
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      root.classList.remove("is-scrolling");
    };
  }, [containerRef]);
}
