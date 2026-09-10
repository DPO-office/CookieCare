import { useRef, useCallback, useEffect } from "react";

export function useAutoResize(minHeight: number, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjust = useCallback(
    (reset?: boolean) => {
      const el = ref.current;
      if (!el) return;
      if (reset) {
        el.style.height = `${minHeight}px`;
        return;
      }
      el.style.height = `${minHeight}px`;
      el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    if (ref.current) ref.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { ref, adjust };
}
