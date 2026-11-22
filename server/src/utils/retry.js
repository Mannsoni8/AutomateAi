export const invokeWithRateLimitRetry = async (fn, maxRetries = 3) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorStr = String(error?.message || error);
      const isRateLimit =
        error?.status === 429 ||
        errorStr.includes("429") ||
        errorStr.includes("rate_limit_exceeded") ||
        errorStr.includes("RateLimitQuotaExhaustedError");

      if (isRateLimit && attempt < maxRetries) {
        // Extract wait seconds from Groq error message if present, e.g. "try again in 3.78s"
        const match = errorStr.match(/try again in ([\d.]+)s/i);
        const waitMs = match
          ? Math.ceil(parseFloat(match[1]) * 1000) + 750
          : (attempt + 1) * 3500;
        console.warn(
          `⚠️ Groq rate limit (429) hit. Waiting ${(waitMs / 1000).toFixed(1)}s before retry (${attempt + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }
};
