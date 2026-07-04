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

  // ---- Phase 3b combos ----

  it("Bull Call Spread: max profit = width - net debit, capped at S ≥ K2", () => {
    // Long K=100 call, short K=105 call. Width = 5.
    const legs: Leg[] = [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
    ];
    const netDebit = entryCost(legs, 100, P.T, P.r, P.sigma);
    expect(netDebit).toBeGreaterThan(0); // debit spread
    // At S=120 (far above K2), payoff caps at width - debit.
    const capped = payoffAtExpiry(120, legs, netDebit);
    expect(capped).toBeCloseTo(5 - netDebit, 6);
    // At S=80 (far below K1), both expire worthless → max loss = -debit.
    expect(payoffAtExpiry(80, legs, netDebit)).toBeCloseTo(-netDebit, 6);
  });

  it("Iron Condor: max loss = wing width - net credit (K=90/95/105/110)", () => {
    // Short 95 put, long 90 put, short 105 call, long 110 call. Wing width = 5.
    const legs: Leg[] = [
      { type: "put", side: "long", K: 90, qty: 1 },
      { type: "put", side: "short", K: 95, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
      { type: "call", side: "long", K: 110, qty: 1 },
    ];
    const netCredit = -entryCost(legs, 100, P.T, P.r, P.sigma);
    expect(netCredit).toBeGreaterThan(0); // credit position
    const wingWidth = 5;
    const maxLoss = wingWidth - netCredit;
    // Deep OTM on either side triggers max loss.
    expect(payoffAtExpiry(80, legs, -netCredit)).toBeCloseTo(-maxLoss, 6);
    expect(payoffAtExpiry(120, legs, -netCredit)).toBeCloseTo(-maxLoss, 6);
    // At S=100 (dead-center) all four legs expire worthless → keep full credit.
    expect(payoffAtExpiry(100, legs, -netCredit)).toBeCloseTo(netCredit, 6);
  });

  it("Long Straddle: payoff symmetric around K at expiry", () => {
    const legs: Leg[] = [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "put", side: "long", K: 100, qty: 1 },
    ];
    const cost = entryCost(legs, 100, P.T, P.r, P.sigma);
    const up = payoffAtExpiry(110, legs, cost);
    const down = payoffAtExpiry(90, legs, cost);
    expect(up).toBeCloseTo(down, 6); // |ΔS| equal → payoff equal
    expect(up).toBeCloseTo(10 - cost, 6);
    // At K itself, both legs worthless → maximum loss = -cost.
    expect(payoffAtExpiry(100, legs, cost)).toBeCloseTo(-cost, 6);
  });

  it("Long Butterfly: peak payoff at K2 (middle strike)", () => {
    // Long 95 / Short 2×100 / Long 105 call butterfly. Wingspan = 5.
    const legs: Leg[] = [
      { type: "call", side: "long", K: 95, qty: 1 },
      { type: "call", side: "short", K: 100, qty: 2 },
      { type: "call", side: "long", K: 105, qty: 1 },
    ];
    const debit = entryCost(legs, 100, P.T, P.r, P.sigma);
    expect(debit).toBeGreaterThan(0);
    const peak = payoffAtExpiry(100, legs, debit);
    const wingLoss = payoffAtExpiry(80, legs, debit);
    // Peak must be strictly greater than deep-OTM payoff.
    expect(peak).toBeGreaterThan(wingLoss);
    // Peak equals width - debit.
    expect(peak).toBeCloseTo(5 - debit, 6);
    // Wing loss equals -debit (all legs worthless).
    expect(wingLoss).toBeCloseTo(-debit, 6);
  });

  it("Calendar spread: per-leg dteOffset — far leg still has value at near expiry", () => {
    // Short 30-day ATM call, long 60-day ATM call (dteOffset=+30).
    const legs: Leg[] = [
      { type: "call", side: "short", K: 100, qty: 1 },
      { type: "call", side: "long", K: 100, qty: 1, dteOffset: 30 },
    ];
    const netDebit = entryCost(legs, 100, P.T, P.r, P.sigma);
    expect(netDebit).toBeGreaterThan(0); // long the more expensive leg
    // At near expiry with S=K, the short leg goes to zero and the long leg
    // still has 30d of time value — payoff must be > -netDebit (better than
    // the pure-intrinsic assumption).
    const intrinsicOnly = payoffAtExpiry(100, legs, netDebit); // sigma=0 default → no MTM
    const withMtm = payoffAtExpiry(100, legs, netDebit, P.r, P.sigma);
    expect(withMtm).toBeGreaterThan(intrinsicOnly);
    // The far leg's remaining BSM value at S=K, T=30d must show up.
    expect(withMtm).toBeGreaterThan(0); // profitable at the peak
  });
});
