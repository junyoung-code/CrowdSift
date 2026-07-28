type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  isTransient?: (error: unknown) => boolean;
};

const isTransientProviderError = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  const status = Number(error.status);
  return status === 429 || status >= 500;
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  {
    maxAttempts,
    baseDelayMs,
    isTransient = isTransientProviderError,
  }: RetryOptions,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransient(error) || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1));
      });
    }
  }

  throw new Error("Retry loop exited unexpectedly");
}
