// Lightweight in-memory sliding-window rate limiter middleware (no external dependencies)
export const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 20,
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
} = {}) => {
  const hits = new Map();

  // Periodically prune expired entries to prevent memory growth
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now >= entry.resetAt) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60 * 1000));
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return (req, res, next) => {
    const key = String(keyGenerator(req));
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, max - entry.count)),
    );
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(entry.resetAt / 1000)),
    );

    if (entry.count > max) {
      return res.status(429).json({ message });
    }

    next();
  };
};
