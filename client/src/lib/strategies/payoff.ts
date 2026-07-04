// Payoff & aggregate-Greeks engine for the strategy library.
// Works on the `Leg` shape from ./definitions (type/side/K/qty).
// All per-share math; multiply by 100 in the UI for a contract.
// Greeks reuse the EXISTING functions in ../options/greeks — no re-derivation.

import { bsmPrice } from "../options/bsm";
import { delta, gamma, theta, vega, rho } from "../options/greeks";
import type { Leg } from "./definitions";

const sign = (side: Leg["side"]): number => (side === "long" ? 1 : -1);

/** Per-share intrinsic value of one leg at expiry. */
function legIntrinsic(leg: Leg, S: number): number {
  if (leg.type === "stock") return S;
  if (leg.type === "call") return Math.max(S - (leg.K ?? 0), 0);
  return Math.max((leg.K ?? 0) - S, 0);
}

/** Per-share BSM value of one leg now (stock = S). */
function legValue(leg: Leg, S: number, T: number, r: number, sigma: number): number {
  if (leg.type === "stock") return S;
  return bsmPrice({ S, K: leg.K ?? 0, T, r, sigma, type: leg.type });
}

/**
 * Entry cost per share (net debit positive, net credit negative).
 * Each leg priced at reference spot S0. Stock leg costs S0.
 */
export function entryCost(
  legs: Leg[],
  S0: number,
  T: number,
  r: number,
  sigma: number,
): number {
  return legs.reduce((acc, leg) => {
    const price = leg.type === "stock" ? S0 : bsmPrice({ S: S0, K: leg.K ?? 0, T, r, sigma, type: leg.type });
    return acc + sign(leg.side) * price * leg.qty;
  }, 0);
}

/**
 * Payoff at expiry per share = position value at expiry − entry cost.
 * entryPrices lets callers pass the debit/credit paid at open.
 */
export function payoffAtExpiry(S: number, legs: Leg[], entryPrices: number): number {
  const value = legs.reduce(
    (acc, leg) => acc + sign(leg.side) * legIntrinsic(leg, S) * leg.qty,
    0,
  );
  return value - entryPrices;
}

/**
 * Current mark-to-market payoff per share using BSM for remaining time T.
 * Same shape as payoffAtExpiry but options keep time value.
 */
export function payoffNow(
  S: number,
  legs: Leg[],
  T: number,
  r: number,
  sigma: number,
  entryPrices: number,
): number {
  const value = legs.reduce(
    (acc, leg) => acc + sign(leg.side) * legValue(leg, S, T, r, sigma) * leg.qty,
    0,
  );
  return value - entryPrices;
}

export interface AggGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/**
 * Aggregate per-share Greeks summed over legs (signed by side, weighted by qty).
 * Stock contributes delta = 1/share, all other Greeks = 0.
 */
export function aggregateGreeks(
  S: number,
  legs: Leg[],
  T: number,
  r: number,
  sigma: number,
): AggGreeks {
  const out: AggGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  for (const leg of legs) {
    const w = sign(leg.side) * leg.qty;
    if (leg.type === "stock") {
      out.delta += w * 1;
      continue;
    }
    const gi = { S, K: leg.K ?? 0, T, r, sigma, type: leg.type };
    out.delta += w * delta(gi);
    out.gamma += w * gamma(gi);
    out.theta += w * theta(gi);
    out.vega += w * vega(gi);
    out.rho += w * rho(gi);
  }
  return out;
}
