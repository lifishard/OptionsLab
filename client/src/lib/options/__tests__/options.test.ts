import { describe, it, expect } from "vitest";
import { bsmPrice, normCdf } from "../bsm";
import { delta, gamma, theta, vega, rho } from "../greeks";
import { impliedVol } from "../iv";
import { expirationPnL, currentPnL, aggregateGreeks, breakevens, Leg } from "../payoff";

describe("normCdf", () => {
  it("is 0.5 at 0 and monotone", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("BSM pricing", () => {
  it("ATM call S=100 K=100 T=1 r=0.05 sigma=0.2 ~ 10.4506", () => {
    const p = bsmPrice({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" });
    expect(p).toBeCloseTo(10.4506, 3);
  });

  it("respects put-call parity: C - P = S e^{-qT} - K e^{-rT}", () => {
    const args = { S: 100, K: 95, T: 0.5, r: 0.05, sigma: 0.25, q: 0.01 };
    const c = bsmPrice({ ...args, type: "call" });
    const p = bsmPrice({ ...args, type: "put" });
    const rhs =
      args.S * Math.exp(-args.q * args.T) - args.K * Math.exp(-args.r * args.T);
    expect(c - p).toBeCloseTo(rhs, 6);
  });

  it("T<=0 returns intrinsic value", () => {
    expect(bsmPrice({ S: 110, K: 100, T: 0, r: 0.05, sigma: 0.2, type: "call" })).toBe(10);
    expect(bsmPrice({ S: 90, K: 100, T: 0, r: 0.05, sigma: 0.2, type: "put" })).toBe(10);
  });
});

describe("Greeks", () => {
  const base = { S: 100, K: 100, T: 0.5, r: 0.05, sigma: 0.3, q: 0 };

  it("Call delta in (0,1), Put delta in (-1,0)", () => {
    const cd = delta({ ...base, type: "call" });
    const pd = delta({ ...base, type: "put" });
    expect(cd).toBeGreaterThan(0);
    expect(cd).toBeLessThan(1);
    expect(pd).toBeGreaterThan(-1);
    expect(pd).toBeLessThan(0);
  });

  it("Gamma is equal for call and put", () => {
    const gc = gamma({ ...base, type: "call" });
    const gp = gamma({ ...base, type: "put" });
    expect(gc).toBeCloseTo(gp, 12);
    expect(gc).toBeGreaterThan(0);
  });

  it("Vega equal for call and put and positive", () => {
    const vc = vega({ ...base, type: "call" });
    const vp = vega({ ...base, type: "put" });
    expect(vc).toBeCloseTo(vp, 12);
    expect(vc).toBeGreaterThan(0);
  });

  it("Theta per-day is annual/365", () => {
    const perDay = theta({ ...base, type: "call" }, true);
    const annual = theta({ ...base, type: "call" }, false);
    expect(perDay).toBeCloseTo(annual / 365, 12);
  });

  it("Rho: call positive, put negative", () => {
    expect(rho({ ...base, type: "call" })).toBeGreaterThan(0);
    expect(rho({ ...base, type: "put" })).toBeLessThan(0);
  });
});

describe("Implied volatility round-trip", () => {
  it("recovers sigma from price within 1e-4 (call)", () => {
    const sigma = 0.42;
    const price = bsmPrice({ S: 105, K: 100, T: 0.75, r: 0.04, sigma, q: 0.01, type: "call" });
    const iv = impliedVol({ price, S: 105, K: 100, T: 0.75, r: 0.04, q: 0.01, type: "call" });
    expect(iv).toBeCloseTo(sigma, 4);
  });

  it("recovers sigma from price within 1e-4 (put)", () => {
    const sigma = 0.18;
    const price = bsmPrice({ S: 95, K: 100, T: 0.3, r: 0.045, sigma, type: "put" });
    const iv = impliedVol({ price, S: 95, K: 100, T: 0.3, r: 0.045, type: "put" });
    expect(iv).toBeCloseTo(sigma, 4);
  });
});

describe("payoff engine", () => {
  it("Long call expiration PnL = (max(S-K,0) - premium) * 100", () => {
    const legs: Leg[] = [
      { type: "call", side: "long", qty: 1, strike: 100, premium: 5, dte: 30, iv: 0.3 },
    ];
    expect(expirationPnL(legs, 120)).toBeCloseTo((Math.max(120 - 100, 0) - 5) * 100, 6);
    expect(expirationPnL(legs, 90)).toBeCloseTo((0 - 5) * 100, 6);
  });

  it("Long call breakeven ~ strike + premium", () => {
    const legs: Leg[] = [
      { type: "call", side: "long", qty: 1, strike: 100, premium: 5, dte: 30, iv: 0.3 },
    ];
    const be = breakevens(legs, 50, 200);
    expect(be.length).toBe(1);
    expect(be[0]).toBeCloseTo(105, 1);
  });

  it("aggregateGreeks: long stock has delta = qty*100, zero others", () => {
    const legs: Leg[] = [
      { type: "stock", side: "long", qty: 2, premium: 100, dte: 0, iv: 0 },
    ];
    const g = aggregateGreeks(legs, 100, 0.05, 0);
    expect(g.delta).toBe(200);
    expect(g.gamma).toBe(0);
    expect(g.vega).toBe(0);
  });

  it("currentPnL of freshly opened long call ~ 0 at open when premium = fair value", () => {
    const fair = bsmPrice({ S: 100, K: 100, T: 30 / 365, r: 0.045, sigma: 0.3, type: "call" });
    const legs: Leg[] = [
      { type: "call", side: "long", qty: 1, strike: 100, premium: fair, dte: 30, iv: 0.3 },
    ];
    expect(currentPnL(legs, 100, 0.045, 0, 0)).toBeCloseTo(0, 4);
  });
});
