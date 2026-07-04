import { describe, it, expect } from "vitest";
import { computeApr } from "../yfinance";

describe("computeApr", () => {
  it("APR = (mid / strike) * (365 / dte) * 100", () => {
    // mid=2, strike=100, dte=30 -> (2/100)*(365/30)*100 = 24.333...
    const apr = computeApr(2, 100, 30);
    expect(apr).toBeCloseTo((2 / 100) * (365 / 30) * 100, 6);
  });

  it("returns null for non-positive inputs", () => {
    expect(computeApr(0, 100, 30)).toBeNull();
    expect(computeApr(2, 0, 30)).toBeNull();
    expect(computeApr(2, 100, 0)).toBeNull();
    expect(computeApr(-1, 100, 30)).toBeNull();
  });

  it("higher mid price -> higher APR, all else equal", () => {
    const low = computeApr(1, 100, 30)!;
    const high = computeApr(5, 100, 30)!;
    expect(high).toBeGreaterThan(low);
  });

  it("shorter dte -> higher annualized APR for the same mid/strike", () => {
    const near = computeApr(2, 100, 7)!;
    const far = computeApr(2, 100, 60)!;
    expect(near).toBeGreaterThan(far);
  });
});
