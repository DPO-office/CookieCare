/**
 * Merge parallel section streams into outline order so the UI never sees
 * interleaved headings from concurrent LLM calls.
 */
export function createOrderedSectionStream(
  sectionCount: number,
  emit: (delta: string) => void
): {
  push: (index: number, delta: string) => void;
  close: (index: number) => void;
} {
  const buffers = Array.from({ length: sectionCount }, () => ({
    text: "",
    emitted: 0,
    closed: false,
  }));
  let head = 0;

  const flush = () => {
    while (head < buffers.length) {
      const slot = buffers[head]!;
      if (slot.emitted < slot.text.length) {
        emit(slot.text.slice(slot.emitted));
        slot.emitted = slot.text.length;
      }
      if (!slot.closed) return;
      head += 1;
      if (head < buffers.length) emit("\n\n");
    }
  };

  return {
    push(index: number, delta: string) {
      if (!delta || index < 0 || index >= buffers.length) return;
      buffers[index]!.text += delta;
      flush();
    },
    close(index: number) {
      if (index < 0 || index >= buffers.length) return;
      buffers[index]!.closed = true;
      flush();
    },
  };
}
