export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface FixedWindowRateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  now?: () => number;
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ maxAttempts, windowMs, now = Date.now }: FixedWindowRateLimiterOptions) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.now = now;
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    const existing = this.entries.get(key);

    if (!existing || existing.resetAt <= now) {
      this.entries.set(key, {
        count: 1,
        resetAt: now + this.windowMs
      });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= this.maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
      };
    }

    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  prune(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
