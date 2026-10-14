import { markdownToHtml } from "../../../shared/utils/markdownToHtml";

function normalizeDraftMarkdownInput(text: string): string {
  let cleaned = text.trim();
  if (!cleaned) return "";

  cleaned = cleaned
    .replace(/^```markdown\s*/i, "")
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return cleaned;
}

export interface SmoothDraftStreamerOptions {
  onUpdate: (html: string) => void;
  onStep?: () => void;
  tickIntervalMs?: number;
}

export interface SmoothDraftStreamer {
  pushDelta: (delta: string) => void;
  finish: (finalContent?: string) => Promise<void>;
  abort: () => void;
  getTargetLength: () => number;
  getRenderedLength: () => number;
}

/**
 * Creates an animated typewriter buffer for live drafting streams.
 *
 * Rather than instantly dumping raw backend token chunks (which causes
 * jarring jumps followed by 2-3 second blank pauses while Gemini 3.1 Pro computes),
 * this streamer buffers incoming tokens and reveals them at a smooth, natural
 * typing cadence. While chunk N is smoothly animating, chunk N+1 arrives
 * from the backend, creating an uninterrupted, fluid drafting experience.
 */
export function createSmoothDraftStreamer(
  options: SmoothDraftStreamerOptions
): SmoothDraftStreamer {
  const { onUpdate, onStep, tickIntervalMs = 35 } = options;

  let targetMarkdown = "";
  let renderedMarkdown = "";
  let isCompleted = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let finishResolver: (() => void) | null = null;

  const tick = () => {
    const backlog = targetMarkdown.length - renderedMarkdown.length;

    if (backlog <= 0) {
      if (isCompleted) {
        if (timerId !== null) {
          clearInterval(timerId);
          timerId = null;
        }
        // Authoritative final render
        const finalHtml = markdownToHtml(normalizeDraftMarkdownInput(targetMarkdown));
        onUpdate(finalHtml);
        if (finishResolver) {
          finishResolver();
          finishResolver = null;
        }
      }
      return;
    }

    // Dynamic pacing calculation:
    // If completed: accelerate drain so user doesn't wait long after backend is done.
    // If still streaming: smooth typing speed tailored to bridge LLM chunk latency (~1.5-2.5s).
    let step: number;
    if (isCompleted) {
      step = Math.max(16, Math.ceil(backlog / 6));
    } else if (backlog > 600) {
      step = Math.ceil(backlog / 20);
    } else if (backlog > 300) {
      step = Math.ceil(backlog / 30);
    } else if (backlog > 120) {
      step = 4;
    } else if (backlog > 40) {
      step = 2;
    } else {
      step = 1;
    }

    const nextLen = Math.min(targetMarkdown.length, renderedMarkdown.length + step);
    renderedMarkdown = targetMarkdown.slice(0, nextLen);

    const html = markdownToHtml(normalizeDraftMarkdownInput(renderedMarkdown));
    onUpdate(html);
    onStep?.();
  };

  const startLoop = () => {
    if (timerId === null) {
      timerId = setInterval(tick, tickIntervalMs);
    }
  };

  return {
    pushDelta(delta: string) {
      if (!delta) return;
      targetMarkdown += delta;
      startLoop();
    },

    finish(finalContent?: string): Promise<void> {
      if (finalContent && finalContent.trim().length > 0) {
        targetMarkdown = finalContent;
      }
      isCompleted = true;

      // If already caught up or nothing buffered, resolve right away
      if (renderedMarkdown.length >= targetMarkdown.length) {
        if (timerId !== null) {
          clearInterval(timerId);
          timerId = null;
        }
        const finalHtml = markdownToHtml(normalizeDraftMarkdownInput(targetMarkdown));
        onUpdate(finalHtml);
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        finishResolver = resolve;
        startLoop();
      });
    },

    abort() {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
      isCompleted = true;
      if (finishResolver) {
        finishResolver();
        finishResolver = null;
      }
    },

    getTargetLength: () => targetMarkdown.length,
    getRenderedLength: () => renderedMarkdown.length,
  };
}
