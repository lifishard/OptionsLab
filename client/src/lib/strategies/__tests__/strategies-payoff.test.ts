import { describe, it, expect } from "vitest";
import { bsmPrice } from "../../options/bsm";
import { payoffAtExpiry, aggregateGreeks, entryCost } from "../payoff";
import type { Leg } from "../definitions";

const P = { T: 30 / 365, r: 0.045, sigma: 0.3 };

describe("strategy payoff", () => {
  it("Long Call at S=110 K=100 expiry payoff = 10 - premium", () => {
    const legs: Leg[] = [{ type: "call", side: "long", K: 100, qty: 1 }];
    const premium = entryCost(legs, 100, P.T, P.r, P.sigma);
    expect(payoffAtExpiry(110, legs, premium)).toBeCloseTo(10 - premium, 6);
  });

  it("Covered Call at S=110 K=105 = min(S,K) - stock cost + premium", () => {
    // stock long @100 + short call K=105
    const legs: Leg[] = [
      { type: "stock", side: "long", qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
    ];
    const premium = bsmPrice({ S: 100, K: 105, T: P.T, r: P.r, sigma: P.sigma, type: "call" });
    // entry cost = 100 (stock) - premium (credit from short call)
    const entry = entryCost(legs, 100, P.T, P.r, P.sigma);
    expect(entry).toBeCloseTo(100 - premium, 6);
    // at S=110 payoff = min(S,K) - stockCost + premium = 105 - 100 + premium
    const expected = 105 - 100 + premium;
    expect(payoffAtExpiry(110, legs, entry)).toBeCloseTo(expected, 6);
  });

  it("Synthetic long delta ≈ 1.0 at ATM", () => {
    const legs: Leg[] = [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "put", side: "short", K: 100, qty: 1 },
    ];
    const g = aggregateGreeks(100, legs, P.T, P.r, P.sigma);
    expect(g.delta).toBeCloseTo(1.0, 2);
  });
});
