/** External store for live report tokens — updates DOM without React state churn. */
export type StreamingStore = {
  getText: () => string;
  setText: (value: string) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStreamingStore(): StreamingStore {
  let text = "";
  const listeners = new Set<() => void>();

  return {
    getText: () => text,
    setText: (value: string) => {
      if (text === value) return;
      text = value;
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
