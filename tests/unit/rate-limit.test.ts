import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit then blocks", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip2")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);
    expect(limiter.check("ip2")).toBe(false);
  });

  it("recovers after the window passes", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 50 });
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);
    // Simulate time passing.
    const realNow = Date.now;
    Date.now = () => realNow() + 100;
    try {
      expect(limiter.check("ip1")).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it("sweep() clears expired windows", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 50 });
    limiter.check("ip1");
    const realNow = Date.now;
    Date.now = () => realNow() + 100;
    try {
      limiter.sweep(Date.now());
      expect(limiter.check("ip1")).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});
