// ── Phase 8 · 移仓引擎 · Set-Operation Diff Engine ──
// "新持仓 = 旧持仓 △ 移仓单" —— treat a position as a multiset of legs keyed by
// (type|side|K|dteOffset). computeDiff(base, target) returns the closes / opens /
// unchanged legs; computeRollImpact re-prices "before vs after" using the EXISTING
// BSM engine (via scenario engine + payoff) — NEVER re-derives any BSM math.
//
// Karpathy rules honored:
//  · Read Before Writing — reuses Leg (definitions.ts), computeScenarioAt (Phase 6),
//    payoffAtExpiry + entryCost (payoff.ts). Nothing forked, nothing re-derived.
//  · Surgical Changes — new file, pure functions only.
//  · Simplicity First — one keying scheme, one grouping pass.
//  · Fail Loudly — empty base/target throws.
//
// NOTE ON THE KEY: the app's Leg type (client/src/lib/strategies/definitions.ts) has
// no `symbol` or ISO `expiry` field — a leg is { type, side, K?, qty, dteOffset? }.
// So the stable key is built from those real fields. `dteOffset` stands in for the
// expiry dimension (calendars/diagonals expire later). long/short are keyed
// independently (never merged), exactly as the spec requires.

import type { Leg } from "@/lib/strategies/definitions";
import { computeScenarioAt, RESET_PRESET, type StressLeg } from "@/lib/scenario/engine";
import { bsmPrice } from "@/lib/options/bsm";
import { payoffAtExpiry, entryCost } from "@/lib/strategies/payoff";

// The conceptual key of a leg (kept as an exported interface for callers/tests).
// `expiry` here is expressed through the leg's dteOffset (days added to base DTE).
export interface LegKey {
  side: "long" | "short"; // 独立算，long/short 不合并
  optionType: "call" | "put" | "stock";
  strike: number; // 0 for stock legs
  dteOffset: number; // stands in for expiry (0 = base expiry)
}

export interface RollDiff {
  base: Leg[]; // 旧持仓
  target: Leg[]; // 目标持仓
  closes: Leg[]; // 要平仓的（base 有、target 减少）
  opens: Leg[]; // 要开仓的（target 有、base 增加）
  unchanged: Leg[]; // 数量相同的
}

export interface RollImpact {
  deltaCashBefore: number;
  deltaCashAfter: number;
  deltaCashDelta: number; // after - before
  aprBefore: number | null; // Σ(short_leg APR × weight) 加权平均，只算 short leg
  aprAfter: number | null;
  breakEvenBefore: number[]; // 盈亏平衡点数组（可能多个）
  breakEvenAfter: number[];
  netCashFlow: number; // 正 = 收权利金（净入），负 = 付权利金（净出）
  greeksCashBefore: { delta: number; gamma: number; theta: number; vega: number };
  greeksCashAfter: { delta: number; gamma: number; theta: number; vega: number };
}

const R_DEFAULT = 0.045;
const CONTRACT = 100;
const DEFAULT_IV = 0.3;
const DEFAULT_DTE = 30;

/** Stable serialization of a leg's identity (ignores qty). */
export function legKey(leg: Leg): string {
  const t = leg.type;
  const k = t === "stock" ? 0 : leg.K ?? 0;
  const off = leg.dteOffset ?? 0;
  return `${t}|${leg.side}|${k}|${off}`;
}

/** Parse a legKey back into its LegKey parts (exported for UI labels/tests). */
export function parseLegKey(key: string): LegKey {
  const [optionType, side, strike, dteOffset] = key.split("|");
  return {
    optionType: optionType as LegKey["optionType"],
    side: side as LegKey["side"],
    strike: Number(strike),
    dteOffset: Number(dteOffset),
  };
}

/** Sum qty per legKey into a Map, keeping a representative leg for reconstruction. */
function groupByKey(legs: Leg[]): Map<string, { leg: Leg; qty: number }> {
  const m = new Map<string, { leg: Leg; qty: number }>();
  for (const leg of legs) {
    const key = legKey(leg);
    const prev = m.get(key);
    if (prev) {
      prev.qty += leg.qty;
    } else {
      m.set(key, { leg: { ...leg }, qty: leg.qty });
    }
  }
  return m;
}

/** Rebuild a Leg from a representative + an (absolute) qty. */
function legWithQty(rep: Leg, qty: number): Leg {
  return { ...rep, qty };
}

/**
 * Set-difference of two positions.
 *   diff = target.qty − base.qty  (per legKey)
 *   > 0 → opens (要开仓, abs qty)
 *   < 0 → closes (要平仓, abs qty)
 *   = 0 → unchanged
 * @throws if both base and target are empty (Fail Loudly).
 */
export function computeDiff(base: Leg[], target: Leg[]): RollDiff {
  if ((!base || base.length === 0) && (!target || target.length === 0)) {
    throw new Error("computeDiff: base 和 target 都是空——先载入一份持仓再移仓。");
  }
  const baseGroups = groupByKey(base ?? []);
  const targetGroups = groupByKey(target ?? []);

  const closes: Leg[] = [];
  const opens: Leg[] = [];
  const unchanged: Leg[] = [];

  const allKeys = new Set<string>([...Array.from(baseGroups.keys()), ...Array.from(targetGroups.keys())]);
  // Deterministic ordering: by strike then key string.
  const sortedKeys = Array.from(allKeys).sort((a, b) => {
    const ka = parseLegKey(a);
    const kb = parseLegKey(b);
    if (ka.strike !== kb.strike) return ka.strike - kb.strike;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  for (const key of sortedKeys) {
    const b = baseGroups.get(key);
    const t = targetGroups.get(key);
    const bq = b?.qty ?? 0;
    const tq = t?.qty ?? 0;
    const rep = (t?.leg ?? b?.leg) as Leg;
    const diff = tq - bq;
    if (diff > 0) {
      opens.push(legWithQty(rep, diff));
    } else if (diff < 0) {
      closes.push(legWithQty(rep, Math.abs(diff)));
    }
    // The overlapping (min) qty stays unchanged.
    const stayQty = Math.min(bq, tq);
    if (stayQty > 0) {
      unchanged.push(legWithQty(rep, stayQty));
    }
  }

  return { base: base ?? [], target: target ?? [], closes, opens, unchanged };
}

// ── pricing helpers (reuse BSM via scenario engine + payoff) ──

/** Ensure legs carry teaching-friendly IV/DTE context for the scenario engine. */
function withCtx(legs: Leg[]): StressLeg[] {
  return legs.map((l) => ({ iv: DEFAULT_IV, dte: DEFAULT_DTE, ...l } as StressLeg));
}

/** Per-share mid (BSM model price) for one leg at the given spot. */
function legMid(leg: Leg, spot: number, r: number): number {
  if (leg.type === "stock") return spot;
  const T = Math.max((DEFAULT_DTE + (leg.dteOffset ?? 0)) / 365, 1e-6);
  return bsmPrice({ S: spot, K: leg.K ?? 0, T, r, sigma: DEFAULT_IV, type: leg.type });
}

/**
 * Weighted-average APR over SHORT option legs only.
 *   per-leg APR = mid / K × 365 / dte × 100  (annualized premium yield, %)
 *   weighted by qty. long-only (no short option legs) → null.
 */
function weightedApr(legs: Leg[], spot: number, r: number): number | null {
  let num = 0;
  let den = 0;
  for (const leg of legs) {
    if (leg.side !== "short" || leg.type === "stock") continue;
    const K = leg.K ?? 0;
    if (K <= 0) continue;
    const dte = Math.max(DEFAULT_DTE + (leg.dteOffset ?? 0), 1);
    const mid = legMid(leg, spot, r);
    const apr = (mid / K) * (365 / dte) * 100;
    num += apr * leg.qty;
    den += leg.qty;
  }
  if (den === 0) return null;
  return num / den;
}

/**
 * Break-even points of the at-expiry payoff, found by scanning for sign changes and
 * refining each root with a bisection to ±0.5% tolerance. Returns up to 4 roots.
 */
function breakEvens(legs: Leg[], spot: number, r: number): number[] {
  if (!legs.length) return [];
  const strikes = legs.map((l) => l.K ?? spot).filter((k) => k > 0);
  const center = strikes.length ? strikes.reduce((a, b) => a + b, 0) / strikes.length : spot;
  const lo = Math.max(0.01, Math.min(center, spot) * 0.4);
  const hi = Math.max(center, spot) * 1.6;
  const sigma = DEFAULT_IV;
  const entry = entryCost(legs, spot, DEFAULT_DTE / 365, r, sigma);
  const f = (s: number) => payoffAtExpiry(s, legs, entry, r, sigma);

  const steps = 240;
  const tol = spot * 0.005; // ±0.5%
  const roots: number[] = [];
  let prevS = lo;
  let prevY = f(lo);
  for (let i = 1; i <= steps; i++) {
    const s = lo + ((hi - lo) * i) / steps;
    const y = f(s);
    if (prevY === 0) {
      roots.push(prevS);
    } else if (prevY * y < 0) {
      // bisection refine on [prevS, s]
      let a = prevS;
      let b = s;
      let fa = prevY;
      let mid = (a + b) / 2;
      for (let k = 0; k < 60 && b - a > tol; k++) {
        mid = (a + b) / 2;
        const fm = f(mid);
        if (fm === 0) break;
        if (fa * fm < 0) {
          b = mid;
        } else {
          a = mid;
          fa = fm;
        }
      }
      roots.push((a + b) / 2);
    }
    prevS = s;
    prevY = y;
  }
  // de-dup within tolerance, cap at 4
  const dedup: number[] = [];
  for (const r0 of roots) {
    if (!dedup.some((d) => Math.abs(d - r0) < tol)) dedup.push(r0);
  }
  return dedup.slice(0, 4);
}

/**
 * Full before/after impact of rolling `base` → `target`.
 *  · deltaCash before/after → reuse Phase 6 computeScenarioAt (RESET params = "today").
 *  · APR → weighted short-leg APR (null if long-only).
 *  · break-even → payoffAtExpiry roots (bisection).
 *  · netCashFlow → per the spec's open/close × side convention.
 *  · greeksCash before/after → the four Cash greeks from the scenario point.
 * @throws if both base and target are empty (Fail Loudly).
 */
export function computeRollImpact(
  base: Leg[],
  target: Leg[],
  spot: number,
  rfRate: number = R_DEFAULT,
): RollImpact {
  if ((!base || base.length === 0) && (!target || target.length === 0)) {
    throw new Error("computeRollImpact: base 和 target 都是空——先载入一份持仓再移仓。");
  }
  const params = { ...RESET_PRESET, rfRate };

  const beforePt = base.length
    ? computeScenarioAt(withCtx(base), spot, params)
    : { deltaCash: 0, gammaCash: 0, thetaCash: 0, vegaCash: 0 };
  const afterPt = target.length
    ? computeScenarioAt(withCtx(target), spot, params)
    : { deltaCash: 0, gammaCash: 0, thetaCash: 0, vegaCash: 0 };

  const greeksCashBefore = {
    delta: beforePt.deltaCash,
    gamma: beforePt.gammaCash,
    theta: beforePt.thetaCash,
    vega: beforePt.vegaCash,
  };
  const greeksCashAfter = {
    delta: afterPt.deltaCash,
    gamma: afterPt.gammaCash,
    theta: afterPt.thetaCash,
    vega: afterPt.vegaCash,
  };

  // netCashFlow from the roll ticket (opens + closes).
  // Convention (per spec):
  //   open  short → +收钱 ; open  long → −付钱
  //   close short → −付钱 (buy back) ; close long → +收钱 (sell out)
  const { opens, closes } = computeDiff(base, target);
  let netCashFlow = 0;
  for (const leg of opens) {
    if (leg.type === "stock") continue;
    const mid = legMid(leg, spot, rfRate);
    const s = leg.side === "short" ? +1 : -1;
    netCashFlow += s * mid * leg.qty * CONTRACT;
  }
  for (const leg of closes) {
    if (leg.type === "stock") continue;
    const mid = legMid(leg, spot, rfRate);
    // closing reverses the sign of holding: closing a short costs money (−),
    // closing a long returns money (+).
    const s = leg.side === "short" ? -1 : +1;
    netCashFlow += s * mid * leg.qty * CONTRACT;
  }

  return {
    deltaCashBefore: beforePt.deltaCash,
    deltaCashAfter: afterPt.deltaCash,
    deltaCashDelta: afterPt.deltaCash - beforePt.deltaCash,
    aprBefore: base.length ? weightedApr(base, spot, rfRate) : null,
    aprAfter: target.length ? weightedApr(target, spot, rfRate) : null,
    breakEvenBefore: breakEvens(base, spot, rfRate),
    breakEvenAfter: breakEvens(target, spot, rfRate),
    netCashFlow,
    greeksCashBefore,
    greeksCashAfter,
  };
}
