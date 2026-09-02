import { useEffect, type RefObject } from "react";

const TABLE_WRAP_SELECTOR = ".md-table-wrap, .md-table-requirements-wrap";

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

      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      const maxScrollLeft = wrap.scrollWidth - wrap.clientWidth;
      if (maxScrollLeft <= 1) {
        root.scrollTop += e.deltaY;
        e.preventDefault();
        return;
      }

      const atLeft = wrap.scrollLeft <= 0;
      const atRight = wrap.scrollLeft >= maxScrollLeft - 1;

      if (e.deltaY < 0 && atLeft) {
        root.scrollTop += e.deltaY;
        e.preventDefault();
      } else if (e.deltaY > 0 && atRight) {
        root.scrollTop += e.deltaY;
        e.preventDefault();
      }
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", onWheel);
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      root.classList.remove("is-scrolling");
    };
  }, [containerRef]);
}
