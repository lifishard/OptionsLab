// Pure helper functions for the Chain page: Portfolio Greeks Cash aggregation
// and APR color scaling. Kept separate from bsm/greeks/iv (which we must not
// modify) so these can be unit tested in isolation.

import type { Leg } from "@/lib/strategies/definitions";

export interface LegGreeks {
  delta: number; // per-share
  gamma: number; // per-share
  theta: number; // per-share, per-day
  vega: number; // per-share, per 1% IV
}

const sign = (side: Leg["side"]) => (side === "long" ? 1 : -1);

/** Delta Cash = Σ(leg_delta × 100 × spot × side × qty). */
export function deltaCash(legs: Leg[], greeksByLeg: LegGreeks[], spot: number): number {
  return legs.reduce((sum, leg, i) => {
    const g = greeksByLeg[i];
    if (!g) return sum;
    return sum + g.delta * 100 * spot * sign(leg.side) * leg.qty;
  }, 0);
}

/** Theta Cash = Σ(leg_theta × 100 × side × qty). */
export function thetaCash(legs: Leg[], greeksByLeg: LegGreeks[]): number {
  return legs.reduce((sum, leg, i) => {
    const g = greeksByLeg[i];
    if (!g) return sum;
    return sum + g.theta * 100 * sign(leg.side) * leg.qty;
  }, 0);
}

/** 1% Gamma Cash = Σ(leg_gamma × 100 × spot × spot × 0.01 × side × qty). */
export function gammaCash(legs: Leg[], greeksByLeg: LegGreeks[], spot: number): number {
  return legs.reduce((sum, leg, i) => {
    const g = greeksByLeg[i];
    if (!g) return sum;
    return sum + g.gamma * 100 * spot * spot * 0.01 * sign(leg.side) * leg.qty;
  }, 0);
}

/** Vega (dimensionless-ish) = Σ(leg_vega × side × qty). */
export function vegaSum(legs: Leg[], greeksByLeg: LegGreeks[]): number {
  return legs.reduce((sum, leg, i) => {
    const g = greeksByLeg[i];
    if (!g) return sum;
    return sum + g.vega * sign(leg.side) * leg.qty;
  }, 0);
}

/**
 * APR gradient: scales an APR percentage (0..30%+) into a 0..1 ratio,
 * clamped, for interpolating background lightness.
 * Low APR -> hsl(140 60% 12%), High APR -> hsl(140 70% 30%).
 */
export function aprToRatio(aprPct: number | null | undefined, capPct = 30): number {
  if (aprPct === null || aprPct === undefined || !isFinite(aprPct) || aprPct <= 0) return 0;
  return Math.max(0, Math.min(1, aprPct / capPct));
}

/** Returns a CSS hsl() background string for a given APR ratio (0..1). */
export function aprBackground(aprPct: number | null | undefined, capPct = 30): string {
  const t = aprToRatio(aprPct, capPct);
  const lightness = 12 + t * (30 - 12);
  const saturation = 60 + t * (70 - 60);
  return `hsl(140 ${saturation.toFixed(0)}% ${lightness.toFixed(0)}%)`;
}

/** Net qty (signed) of legs at a given strike, for the gutter marker. Positive = net long. */
export function netQtyAtStrike(legs: Leg[], strike: number): number {
  return legs
    .filter((l) => l.type !== "stock" && l.K === strike)
    .reduce((sum, l) => sum + sign(l.side) * l.qty, 0);
}
