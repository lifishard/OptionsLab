// ── Phase 6 · 末日压力测试 · Scenario Engine ──
// Pure functions. Applies (spot, time, IV) perturbations to a Leg[] position and
// re-prices via the EXISTING BSM engine + greeks. This file NEVER re-derives any
// BSM math — it only calls bsmPrice / delta / gamma / theta / vega and aggregates
// the "Cash" figures using the same contract-multiplier conventions the Chain page
// uses (see client/src/lib/options/chain-math.ts).
//
// Karpathy rules honored: Fail Loudly (empty legs throws), Surgical Changes (no
// touching bsm.ts / greeks.ts / definitions.ts), Simplicity First (one perturbation
// helper, reused by every consumer).

import { bsmPrice } from "@/lib/options/bsm";
import { delta, gamma, theta, vega } from "@/lib/options/greeks";
import type { Leg } from "@/lib/strategies/definitions";

// A Leg can optionally carry the market context the stress page borrowed from the
// live option chain (implied vol + days-to-expiry). When absent we fall back to
// teaching-friendly defaults so the engine still runs on bare Leg[] (e.g. from a
// deep-link where only strike/side/qty survived the base64 round-trip).
export interface StressLeg extends Leg {
  iv?: number; // decimal, e.g. 0.30
  dte?: number; // calendar days to expiry for THIS leg's near expiry
}

export const DEFAULT_IV = 0.3;
export const DEFAULT_DTE = 30;
const MIN_T = 1 / 365 / 24; // one hour, so BSM never divides by zero
const IV_MIN = 0.05;
const IV_MAX = 3.0;
const CONTRACT = 100; // shares per contract

export interface ScenarioParams {
  spotShiftPct: number; // e.g. -0.33 = spot × 0.67
  daysForward: number; // e.g. 30 = T-30 days elapsed
  ivShiftPct: number; // e.g. 0.5 = IV × 1.5 (globally; per-expiry v2)
  rfRate?: number; // default 0.045
}

export interface ScenarioPoint {
  spot: number; // x-axis anchor spot
  pnl: number; // total P&L cash for full position
  deltaCash: number;
  gammaCash: number; // 1% gamma cash
  thetaCash: number; // daily theta cash
  vegaCash: number; // 1vol vega cash
}

const DEFAULT_R = 0.045;
const sign = (side: Leg["side"]): number => (side === "long" ? 1 : -1);

function legIv(leg: StressLeg): number {
  const iv = leg.iv;
  return iv !== undefined && isFinite(iv) && iv > 0 ? iv : DEFAULT_IV;
}
function legDte(leg: StressLeg): number {
  const d = leg.dte;
  const base = d !== undefined && isFinite(d) && d > 0 ? d : DEFAULT_DTE;
  return base + (leg.dteOffset ?? 0);
}

/** Clamp a shifted IV into a sane band. Exported for tests. */
export function shiftedIv(baseIv: number, ivShiftPct: number): number {
  const raw = baseIv * (1 + ivShiftPct);
  return Math.max(IV_MIN, Math.min(IV_MAX, raw));
}

/** Perturbed time-to-expiry (years) for one leg after fast-forwarding `daysForward`. */
export function shiftedT(baseDte: number, daysForward: number): number {
  const t = (baseDte - daysForward) / 365;
  return Math.max(t, MIN_T);
}

/**
 * Per-share OPEN value of one leg, at the anchor spot and un-perturbed IV/T.
 * Used as the cost basis for P&L. Stock opens at spotAnchor.
 */
function legOpenValue(leg: StressLeg, spotAnchor: number, r: number): number {
  if (leg.type === "stock") return spotAnchor;
  const T = Math.max(legDte(leg) / 365, MIN_T);
  return bsmPrice({ S: spotAnchor, K: leg.K ?? 0, T, r, sigma: legIv(leg), type: leg.type });
}

interface PerturbedLeg {
  value: number; // per-share BSM value under scenario
  delta: number; // per-share
  gamma: number; // per-share
  theta: number; // per-share per-day
  vega: number; // per-share per 1% IV
}

/** Re-price + re-greek one leg under a perturbed (spot', T', IV'). */
function perturbLeg(leg: StressLeg, spotP: number, params: ScenarioParams): PerturbedLeg {
  const r = params.rfRate ?? DEFAULT_R;
  if (leg.type === "stock") {
    return { value: spotP, delta: 1, gamma: 0, theta: 0, vega: 0 };
  }
  const K = leg.K ?? 0;
  const T = shiftedT(legDte(leg), params.daysForward);
  const sigma = shiftedIv(legIv(leg), params.ivShiftPct);
  const type = leg.type;
  const gi = { S: spotP, K, T, r, sigma, type };
  return {
    value: bsmPrice({ S: spotP, K, T, r, sigma, type }),
    delta: delta(gi),
    gamma: gamma(gi),
    theta: theta(gi),
    vega: vega(gi),
  };
}

/**
 * Compute a full scenario curve across a spot range. Each point aggregates the
 * whole position's P&L cash and Cash-flavoured Greeks (contract multiplier + side + qty).
 *
 * Cash conventions mirror chain-math.ts:
 *  - deltaCash  = Σ(δ · 100 · spot · side · qty)
 *  - gammaCash  = Σ(γ · 100 · spot² · 0.01 · side · qty)   (1% gamma cash)
 *  - thetaCash  = Σ(θ · 100 · side · qty)                   (per-day)
 *  - vegaCash   = Σ(vega · 100 · side · qty)                (per 1 vol pt)
 *  - pnl        = Σ((value' − openValue) · 100 · side · qty)
 *
 * @throws if legs is empty (Fail Loudly). Callers should guard the empty state in UI.
 */
export function computeScenarioCurve(
  legs: StressLeg[],
  spotAnchor: number,
  params: ScenarioParams,
  spotRange: [number, number],
  gridSize: number = 121,
): ScenarioPoint[] {
  if (!legs || legs.length === 0) {
    throw new Error("computeScenarioCurve: 空持仓——先加个持仓再压。");
  }
  const r = params.rfRate ?? DEFAULT_R;
  const [lo, hi] = spotRange;
  const n = Math.max(2, Math.floor(gridSize));
  const step = (hi - lo) / (n - 1);

  // Cost basis per leg is fixed (opened at the anchor spot).
  const openValues = legs.map((leg) => legOpenValue(leg, spotAnchor, r));

  const points: ScenarioPoint[] = [];
  for (let i = 0; i < n; i++) {
    const spotP = lo + step * i;
    let pnl = 0;
    let deltaCash = 0;
    let gammaCash = 0;
    let thetaCash = 0;
    let vegaCash = 0;
    for (let j = 0; j < legs.length; j++) {
      const leg = legs[j];
      const w = sign(leg.side) * leg.qty;
      const p = perturbLeg(leg, spotP, params);
      pnl += (p.value - openValues[j]) * CONTRACT * w;
      deltaCash += p.delta * CONTRACT * spotP * w;
      gammaCash += p.gamma * CONTRACT * spotP * spotP * 0.01 * w;
      thetaCash += p.theta * CONTRACT * w;
      vegaCash += p.vega * CONTRACT * w;
    }
    points.push({ spot: spotP, pnl, deltaCash, gammaCash, thetaCash, vegaCash });
  }
  return points;
}

/**
 * Aggregate the position's Cash Greeks + P&L at a SINGLE spot (the anchor, perturbed
 * by params). Used by the 5 top cards. Reuses the same per-leg loop as the curve.
 * Empty legs -> a zeroed point (UI shows the empty state), does NOT throw here so
 * the cards can render placeholders.
 */
export function computeScenarioAt(
  legs: StressLeg[],
  spotAnchor: number,
  params: ScenarioParams,
): ScenarioPoint {
  const empty: ScenarioPoint = { spot: spotAnchor, pnl: 0, deltaCash: 0, gammaCash: 0, thetaCash: 0, vegaCash: 0 };
  if (!legs || legs.length === 0) return empty;
  const spotP = spotAnchor * (1 + params.spotShiftPct);
  const r = params.rfRate ?? DEFAULT_R;
  const openValues = legs.map((leg) => legOpenValue(leg, spotAnchor, r));
  let pnl = 0, deltaCash = 0, gammaCash = 0, thetaCash = 0, vegaCash = 0;
  for (let j = 0; j < legs.length; j++) {
    const leg = legs[j];
    const w = sign(leg.side) * leg.qty;
    const p = perturbLeg(leg, spotP, params);
    pnl += (p.value - openValues[j]) * CONTRACT * w;
    deltaCash += p.delta * CONTRACT * spotP * w;
    gammaCash += p.gamma * CONTRACT * spotP * spotP * 0.01 * w;
    thetaCash += p.theta * CONTRACT * w;
    vegaCash += p.vega * CONTRACT * w;
  }
  return { spot: spotP, pnl, deltaCash, gammaCash, thetaCash, vegaCash };
}

/**
 * Daily theta cash from now (day 0) through `daysAhead`. For each day n we roll the
 * clock forward n days (on top of the scenario's own daysForward) at the CURRENT
 * (spot-shifted) spot, and report that day's aggregate theta cash. This gives the
 * "THETA CASH DAILY" bar chart (green = collecting premium, red = paying it).
 *
 * @throws if legs is empty (Fail Loudly).
 */
export function computeThetaDaily(
  legs: StressLeg[],
  spotAnchor: number,
  params: ScenarioParams,
  daysAhead: number = 30,
): { day: number; date: string; thetaCash: number }[] {
  if (!legs || legs.length === 0) {
    throw new Error("computeThetaDaily: 空持仓——先加个持仓再压。");
  }
  const spotP = spotAnchor * (1 + params.spotShiftPct);
  const start = new Date();
  const out: { day: number; date: string; thetaCash: number }[] = [];
  for (let n = 0; n <= Math.max(0, Math.floor(daysAhead)); n++) {
    const dayParams: ScenarioParams = { ...params, daysForward: params.daysForward + n };
    let thetaCash = 0;
    for (const leg of legs) {
      if (leg.type === "stock") continue;
      const w = sign(leg.side) * leg.qty;
      const p = perturbLeg(leg, spotP, dayParams);
      thetaCash += p.theta * CONTRACT * w;
    }
    const d = new Date(start.getTime() + n * 86400000);
    const date = `${d.getMonth() + 1}/${d.getDate()}`;
    out.push({ day: n, date, thetaCash });
  }
  return out;
}

// ── "末日按钮" preset + reset ──
export const DOOMSDAY_PRESET: ScenarioParams = {
  spotShiftPct: -0.3,
  daysForward: 30,
  ivShiftPct: 1.0,
  rfRate: 0.045,
};
export const RESET_PRESET: ScenarioParams = {
  spotShiftPct: 0,
  daysForward: 0,
  ivShiftPct: 0,
  rfRate: 0.045,
};
