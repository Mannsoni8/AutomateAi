import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { invokeWithRateLimitRetry } from "../src/utils/retry.js";

describe("Rate Limit Auto-Retry Tests", () => {
  it("immediately returns function result on first successful attempt", async () => {
    let callCount = 0;
    const testFn = async () => {
      callCount++;
      return { output: "success" };
    };

    const result = await invokeWithRateLimitRetry(testFn, 3);
    assert.equal(callCount, 1);
    assert.deepEqual(result, { output: "success" });
  });

  it("retries upon encountering 429 rate limit and succeeds on subsequent try", async () => {
    let callCount = 0;
    const testFn = async () => {
      callCount++;
      if (callCount === 1) {
        const rateLimitErr = new Error(
          "Rate limit reached on TPM: Limit 8000, Used 5458. Please try again in 0.05s.",
        );
        rateLimitErr.status = 429;
        throw rateLimitErr;
      }
      return { output: "recovered" };
    };

    const startTime = Date.now();
    const result = await invokeWithRateLimitRetry(testFn, 2);
    const duration = Date.now() - startTime;

    assert.equal(callCount, 2, "Function should have been called twice");
    assert.deepEqual(result, { output: "recovered" });
    assert.ok(duration >= 50, "Should have waited for the extracted retry window");
  });

  it("re-throws immediately on non-429 errors without retrying", async () => {
    let callCount = 0;
    const testFn = async () => {
      callCount++;
      const authErr = new Error("Invalid API Key (401)");
      authErr.status = 401;
      throw authErr;
    };

    await assert.rejects(
      async () => {
        await invokeWithRateLimitRetry(testFn, 3);
      },
      /Invalid API Key/i,
      "Should fail with the exact non-429 error",
    );

    assert.equal(callCount, 1, "Must not retry on non-429 errors");
  });

  it("re-throws after exhausting maxRetries on continuous 429 errors", async () => {
    let callCount = 0;
    const maxRetries = 2;
    const testFn = async () => {
      callCount++;
      const rateLimitErr = new Error(
        "RateLimitQuotaExhaustedError: 429 rate_limit_exceeded. Please try again in 0.01s.",
      );
      rateLimitErr.status = 429;
      throw rateLimitErr;
    };

    await assert.rejects(
      async () => {
        await invokeWithRateLimitRetry(testFn, maxRetries);
      },
      /RateLimitQuotaExhaustedError/i,
    );

    assert.equal(
      callCount,
      maxRetries + 1,
      `Should have executed initial attempt plus ${maxRetries} retries`,
    );
  });
});
