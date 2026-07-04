import { describe, it, expect } from "vitest";
import {
  computeScenarioCurve,
  computeScenarioAt,
  computeThetaDaily,
  shiftedIv,
  shiftedT,
  DOOMSDAY_PRESET,
  RESET_PRESET,
  DEFAULT_IV,
  DEFAULT_DTE,
  type ScenarioParams,
  type StressLeg,
} from "./engine";

// Reuse the SAME cash formulas the Chain page trusts, to prove the RESET case
// lines up with the app's existing Greeks-Cash aggregation.
import { delta, gamma, theta, vega } from "../options/greeks";

const R = 0.045;
const SPOT = 100;

function ctx(leg: StressLeg): StressLeg {
  return { iv: DEFAULT_IV, dte: DEFAULT_DTE, ...leg };
}

describe("scenario engine · perturbation helpers", () => {
  it("shiftedIv scales and clamps into [0.05, 3.0]", () => {
    expect(shiftedIv(0.3, 0.5)).toBeCloseTo(0.45, 6); // 0.3 × 1.5
    expect(shiftedIv(0.3, -1)).toBe(0.05); // clamp floor
    expect(shiftedIv(2.5, 1.0)).toBe(3.0); // clamp ceiling
  });

  it("shiftedT fast-forwards days and never goes to zero", () => {
    expect(shiftedT(30, 0)).toBeCloseTo(30 / 365, 6);
    expect(shiftedT(30, 15)).toBeCloseTo(15 / 365, 6);
    // 30 days forward on a 30-DTE leg -> clamped to the 1-hour floor, not 0.
    expect(shiftedT(30, 30)).toBeGreaterThan(0);
    expect(shiftedT(30, 30)).toBeLessThan(1 / 365);
  });
});

describe("scenario engine · computeScenarioCurve", () => {
  it("empty legs throws (Fail Loudly)", () => {
    expect(() => computeScenarioCurve([], SPOT, RESET_PRESET, [50, 150])).toThrow();
  });

  it("single long call ATM, spot −30% -> pnl negative at the shifted spot", () => {
    const legs: StressLeg[] = [ctx({ type: "call", side: "long", K: 100, qty: 1 })];
    const params: ScenarioParams = { spotShiftPct: -0.3, daysForward: 0, ivShiftPct: 0, rfRate: R };
    const at = computeScenarioAt(legs, SPOT, params);
    expect(at.pnl).toBeLessThan(0);
    // and the curve returns the requested resolution
    const curve = computeScenarioCurve(legs, SPOT, params, [SPOT * 0.5, SPOT * 1.5], 61);
    expect(curve).toHaveLength(61);
    expect(curve.every((p) => isFinite(p.pnl))).toBe(true);
  });

  it("curve honors gridSize and spot range endpoints", () => {
    const legs: StressLeg[] = [ctx({ type: "put", side: "long", K: 100, qty: 2 })];
    const curve = computeScenarioCurve(legs, SPOT, RESET_PRESET, [20, 332], 121);
    expect(curve).toHaveLength(121);
    expect(curve[0].spot).toBeCloseTo(20, 6);
    expect(curve[curve.length - 1].spot).toBeCloseTo(332, 6);
  });
});

describe("scenario engine · theta daily", () => {
  it("short OTM call: 30-day daily theta cash sum ≈ curve-consistent (no NaN)", () => {
    const legs: StressLeg[] = [ctx({ type: "call", side: "short", K: 110, qty: 1 })];
    const params: ScenarioParams = { spotShiftPct: 0, daysForward: 0, ivShiftPct: 0, rfRate: R };
    const daily = computeThetaDaily(legs, SPOT, params, 30);
    expect(daily).toHaveLength(31); // day 0..30 inclusive
    expect(daily.every((d) => isFinite(d.thetaCash))).toBe(true);

    // Day-0 daily theta must equal the aggregate theta cash at day 0 (±1%).
    const at = computeScenarioAt(legs, SPOT, params);
    expect(Math.abs(daily[0].thetaCash - at.thetaCash)).toBeLessThan(
      Math.abs(at.thetaCash) * 0.01 + 1e-6,
    );
    // A short option should be COLLECTING theta -> positive daily theta cash.
    expect(daily[0].thetaCash).toBeGreaterThan(0);
  });

  it("empty legs throws for theta daily too", () => {
    expect(() => computeThetaDaily([], SPOT, RESET_PRESET)).toThrow();
  });
});

describe("scenario engine · presets", () => {
  it("DOOMSDAY on a long ATM put -> pnl clearly positive", () => {
    const legs: StressLeg[] = [ctx({ type: "put", side: "long", K: 100, qty: 1 })];
    const at = computeScenarioAt(legs, SPOT, DOOMSDAY_PRESET);
    expect(at.pnl).toBeGreaterThan(0);
    // Long put profits big on a −30% crash + IV doubling.
    expect(at.pnl).toBeGreaterThan(1000);
  });

  it("RESET preset reproduces the app's current Greeks-Cash aggregation", () => {
    // Two-leg position; compute expected cash with the SAME formulas chain-math uses.
    const legs: StressLeg[] = [
      ctx({ type: "call", side: "long", K: 100, qty: 1 }),
      ctx({ type: "put", side: "short", K: 95, qty: 2 }),
    ];
    const at = computeScenarioAt(legs, SPOT, RESET_PRESET);

    const sign = (s: "long" | "short") => (s === "long" ? 1 : -1);
    let dCash = 0, gCash = 0, tCash = 0, vCash = 0;
    for (const leg of legs) {
      const w = sign(leg.side) * leg.qty;
      const T = DEFAULT_DTE / 365;
      const gi = { S: SPOT, K: leg.K!, T, r: R, sigma: DEFAULT_IV, type: leg.type as "call" | "put" };
      dCash += delta(gi) * 100 * SPOT * w;
      gCash += gamma(gi) * 100 * SPOT * SPOT * 0.01 * w;
      tCash += theta(gi) * 100 * w;
      vCash += vega(gi) * 100 * w;
    }
    expect(at.deltaCash).toBeCloseTo(dCash, 4);
    expect(at.gammaCash).toBeCloseTo(gCash, 4);
    expect(at.thetaCash).toBeCloseTo(tCash, 4);
    expect(at.vegaCash).toBeCloseTo(vCash, 4);
    // At reset (no shift, no time) pnl on freshly-opened legs is ~0.
    expect(Math.abs(at.pnl)).toBeLessThan(1e-6);
  });

  it("stock leg contributes pure delta cash and zero theta/vega", () => {
    const legs: StressLeg[] = [{ type: "stock", side: "long", qty: 1 }];
    const at = computeScenarioAt(legs, SPOT, RESET_PRESET);
    expect(at.deltaCash).toBeCloseTo(100 * SPOT, 6); // 100 shares × spot
    expect(at.thetaCash).toBe(0);
    expect(at.vegaCash).toBe(0);
  });
});
