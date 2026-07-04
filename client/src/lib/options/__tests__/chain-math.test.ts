import { describe, it, expect } from "vitest";
import {
  deltaCash,
  thetaCash,
  gammaCash,
  vegaSum,
  aprToRatio,
  aprBackground,
  netQtyAtStrike,
  type LegGreeks,
} from "../chain-math";
import type { Leg } from "../../strategies/definitions";

describe("Portfolio Greeks Cash", () => {
  const spot = 100;
  const legs: Leg[] = [
    { type: "call", side: "long", K: 100, qty: 2 },
    { type: "put", side: "short", K: 95, qty: 1 },
  ];
  const greeks: LegGreeks[] = [
    { delta: 0.5, gamma: 0.02, theta: -0.05, vega: 0.1 },
    { delta: -0.3, gamma: 0.015, theta: -0.04, vega: 0.08 },
  ];

  it("deltaCash sums leg_delta * 100 * spot * side * qty", () => {
    // leg0: 0.5 * 100 * 100 * 1 * 2 = 10000
    // leg1: -0.3 * 100 * 100 * -1 * 1 = 3000 (short put -> negative sign flips)
    const expected = 0.5 * 100 * spot * 1 * 2 + -0.3 * 100 * spot * -1 * 1;
    expect(deltaCash(legs, greeks, spot)).toBeCloseTo(expected, 6);
  });

  it("thetaCash sums leg_theta * 100 * side * qty", () => {
    const expected = -0.05 * 100 * 1 * 2 + -0.04 * 100 * -1 * 1;
    expect(thetaCash(legs, greeks)).toBeCloseTo(expected, 6);
  });

  it("gammaCash sums leg_gamma * 100 * spot^2 * 0.01 * side * qty", () => {
    const expected =
      0.02 * 100 * spot * spot * 0.01 * 1 * 2 + 0.015 * 100 * spot * spot * 0.01 * -1 * 1;
    expect(gammaCash(legs, greeks, spot)).toBeCloseTo(expected, 6);
  });

  it("vegaSum sums leg_vega * side * qty", () => {
    const expected = 0.1 * 1 * 2 + 0.08 * -1 * 1;
    expect(vegaSum(legs, greeks)).toBeCloseTo(expected, 6);
  });

  it("returns 0 for empty legs", () => {
    expect(deltaCash([], [], spot)).toBe(0);
    expect(thetaCash([], [])).toBe(0);
    expect(gammaCash([], [], spot)).toBe(0);
    expect(vegaSum([], [])).toBe(0);
  });
});

describe("APR gradient", () => {
  it("clamps ratio to [0,1]", () => {
    expect(aprToRatio(null)).toBe(0);
    expect(aprToRatio(-5)).toBe(0);
    expect(aprToRatio(0)).toBe(0);
    expect(aprToRatio(15, 30)).toBeCloseTo(0.5, 6);
    expect(aprToRatio(30, 30)).toBe(1);
    expect(aprToRatio(1000, 30)).toBe(1);
  });

  it("aprBackground goes from low to high lightness/saturation", () => {
    const low = aprBackground(0);
    const high = aprBackground(30);
    expect(low).toBe("hsl(140 60% 12%)");
    expect(high).toBe("hsl(140 70% 30%)");
  });
});

describe("netQtyAtStrike (gutter marker)", () => {
  it("sums signed qty of legs at a given strike, ignoring stock legs", () => {
    const legs: Leg[] = [
      { type: "call", side: "long", K: 450, qty: 3 },
      { type: "put", side: "short", K: 450, qty: 2 },
      { type: "call", side: "long", K: 460, qty: 1 },
      { type: "stock", side: "long", qty: 1 },
    ];
    expect(netQtyAtStrike(legs, 450)).toBe(1); // +3 - 2
    expect(netQtyAtStrike(legs, 460)).toBe(1);
    expect(netQtyAtStrike(legs, 470)).toBe(0);
  });
});
