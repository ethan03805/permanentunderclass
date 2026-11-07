// Sliding-window limiter held in memory only. Nothing about callers is written to disk.

export class RateLimiter {
  limit: number;
  windowMs: number;
  hits = new Map<string, number[]>();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Records a hit for `key` and returns false if the key is over its limit. */
  take(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    if (this.hits.size > 10_000) this.sweep(since);
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private sweep(since: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= since)) this.hits.delete(key);
    }
  }
}
