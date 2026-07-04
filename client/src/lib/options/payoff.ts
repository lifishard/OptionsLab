// Multi-leg position P&L and aggregated-Greeks engine. Pure TS.
// Phase 3 (strategy library / builder) leans heavily on this.

import { OptionType, bsmPrice } from "./bsm";
import { delta, gamma, theta, vega, rho } from "./greeks";

export type LegType = OptionType | "stock";
export type Side = "long" | "short";

export interface Leg {
  type: LegType;
  side: Side;
  qty: number; // contracts (1 = 100 shares); for stock, number of 100-share lots
  strike?: number; // not needed for stock
  premium?: number; // opening cost per share; for stock, the entry price
  dte: number; // days to expiry
  iv: number; // implied vol (decimal, e.g. 0.30)
}

const CONTRACT = 100; // shares per contract
const DAYS_PER_YEAR = 365;

function sign(side: Side): number {
  return side === "long" ? 1 : -1;
}

/** Per-share theoretical value of a single leg at spot S, given remaining time. */
function legUnitValue(leg: Leg, S: number, r: number, q: number, tOffsetDays = 0): number {
  if (leg.type === "stock") {
    return S;
  }
  const T = Math.max((leg.dte - tOffsetDays) / DAYS_PER_YEAR, 0);
  return bsmPrice({ S, K: leg.strike!, T, r, sigma: leg.iv, q, type: leg.type });
}

/**
 * Current theoretical value of the whole position (signed).
 * Sum over legs of unitValue * qty * 100 * side.
 * tOffset advances time forward by this many days.
 */
export function positionValue(
  legs: Leg[],
  S: number,
  r: number,
  q = 0,
  tOffset = 0,
): number {
  return legs.reduce((acc, leg) => {
    const unit = legUnitValue(leg, S, r, q, tOffset);
    return acc + sign(leg.side) * unit * leg.qty * CONTRACT;
  }, 0);
}

/** Per-share intrinsic value of a leg at expiration. */
function legExpirationUnit(leg: Leg, S: number): number {
  if (leg.type === "stock") return S;
  if (leg.type === "call") return Math.max(S - leg.strike!, 0);
  return Math.max(leg.strike! - S, 0);
}

/**
 * Position P&L at expiration for underlying price S.
 * PnL = (payoff - premium paid) * qty * 100 * side.
 */
export function expirationPnL(legs: Leg[], S: number): number {
  return legs.reduce((acc, leg) => {
    const payoff = legExpirationUnit(leg, S);
    const cost = leg.premium ?? 0;
    return acc + sign(leg.side) * (payoff - cost) * leg.qty * CONTRACT;
  }, 0);
}

/**
 * Current theoretical P&L after `daysElapsed` days have passed.
 * Uses BSM to discount remaining time value, minus opening premium.
 */
export function currentPnL(
  legs: Leg[],
  S: number,
  r: number,
  q: number,
  daysElapsed: number,
): number {
  return legs.reduce((acc, leg) => {
    const value = legUnitValue(leg, S, r, q, daysElapsed);
    const cost = leg.premium ?? 0;
    return acc + sign(leg.side) * (value - cost) * leg.qty * CONTRACT;
  }, 0);
}

export interface AggregatedGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/**
 * Aggregate per-unit Greeks across all legs (weighted by signed qty * 100).
 * Stock contributes delta = 1 per share; other Greeks are 0.
 */
export function aggregateGreeks(
  legs: Leg[],
  S: number,
  r: number,
  q = 0,
): AggregatedGreeks {
  const out: AggregatedGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  for (const leg of legs) {
    const w = sign(leg.side) * leg.qty * CONTRACT;
    if (leg.type === "stock") {
      out.delta += w * 1;
      continue;
    }
    const T = Math.max(leg.dte / DAYS_PER_YEAR, 0);
    const gi = { S, K: leg.strike!, T, r, sigma: leg.iv, q, type: leg.type };
    out.delta += w * delta(gi);
    out.gamma += w * gamma(gi);
    out.theta += w * theta(gi);
    out.vega += w * vega(gi);
    out.rho += w * rho(gi);
  }
  return out;
}

/**
 * Find breakeven underlying prices at expiration by scanning [sMin, sMax]
 * for sign changes in expirationPnL, then bisecting each bracket.
 */
export function breakevens(legs: Leg[], sMin: number, sMax: number): number[] {
  const steps = 500;
  const dx = (sMax - sMin) / steps;
  const roots: number[] = [];
  let prevS = sMin;
  let prevP = expirationPnL(legs, prevS);

  for (let i = 1; i <= steps; i++) {
    const s = sMin + i * dx;
    const p = expirationPnL(legs, s);
    if (prevP === 0) {
      roots.push(prevS);
    } else if (prevP * p < 0) {
      // bisect within [prevS, s]
      let lo = prevS;
      let hi = s;
      let plo = prevP;
      for (let j = 0; j < 60; j++) {
        const mid = 0.5 * (lo + hi);
        const pm = expirationPnL(legs, mid);
        if (Math.abs(pm) < 1e-6 || (hi - lo) < 1e-6) {
          lo = hi = mid;
          break;
        }
        if (pm * plo < 0) {
          hi = mid;
        } else {
          lo = mid;
          plo = pm;
        }
      }
      roots.push(0.5 * (lo + hi));
    }
    prevS = s;
    prevP = p;
  }
  // Deduplicate near-identical roots.
  const unique: number[] = [];
  for (const r of roots) {
    if (!unique.some((u) => Math.abs(u - r) < 1e-3)) unique.push(r);
  }
  return unique;
}
