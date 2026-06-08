/**
 * Exponential backoff utility for retrying asynchronous operations.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries === 0) throw error;

    // Only retry on potential transient errors
    const isTransient =
      error.message?.includes("fetch failed") ||
      error.message?.includes("socket hang up") ||
      error.message?.includes("503") ||
      error.message?.includes("504") ||
      error.message?.includes("429"); // Rate limit

    if (!isTransient) throw error;

    console.warn(`Retry attempt remaining: ${retries}. Error: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}
