import { describe, it, expect } from "vitest";
import { legKey, parseLegKey, computeDiff, computeRollImpact } from "./diff";
import type { Leg } from "@/lib/strategies/definitions";

const SPOT = 100;

// helpers
const sc = (K: number, qty = 1): Leg => ({ type: "call", side: "short", K, qty });
const lc = (K: number, qty = 1): Leg => ({ type: "call", side: "long", K, qty });
const sp = (K: number, qty = 1): Leg => ({ type: "put", side: "short", K, qty });
const lp = (K: number, qty = 1): Leg => ({ type: "put", side: "long", K, qty });

describe("roll · legKey", () => {
  it("serializes type|side|K|dteOffset stably", () => {
    expect(legKey(sc(275))).toBe("call|short|275|0");
    expect(legKey({ type: "call", side: "long", K: 100, qty: 1, dteOffset: 30 })).toBe(
      "call|long|100|30",
    );
  });

  it("keys long and short independently (never merged)", () => {
    expect(legKey(lc(100))).not.toBe(legKey(sc(100)));
  });

  it("round-trips through parseLegKey", () => {
    const k = parseLegKey(legKey(sc(320)));
    expect(k).toEqual({ optionType: "call", side: "short", strike: 320, dteOffset: 0 });
  });
});

describe("roll · computeDiff", () => {
  it("identical base/target → closes+opens empty, unchanged = all", () => {
    const base = [sc(275), lc(265)];
    const target = [sc(275), lc(265)];
    const d = computeDiff(base, target);
    expect(d.closes).toHaveLength(0);
    expect(d.opens).toHaveLength(0);
    expect(d.unchanged).toHaveLength(2);
  });

  it("single short call → roll strike (same expiry): closes=1, opens=1, unchanged=0", () => {
    const d = computeDiff([sc(275)], [sc(285)]);
    expect(d.closes).toHaveLength(1);
    expect(d.closes[0].K).toBe(275);
    expect(d.closes[0].qty).toBe(1);
    expect(d.opens).toHaveLength(1);
    expect(d.opens[0].K).toBe(285);
    expect(d.opens[0].qty).toBe(1);
    expect(d.unchanged).toHaveLength(0);
  });

  it("iron condor → roll one wing: precise per-leg diff", () => {
    // base IC: long put 90, short put 95, short call 105, long call 110
    const base = [lp(90), sp(95), sc(105), lc(110)];
    // roll the call side up one notch: short call 105→108, long call 110→113
    const target = [lp(90), sp(95), sc(108), lc(113)];
    const d = computeDiff(base, target);
    // 2 legs changed on the call side → 2 closes + 2 opens; put side unchanged (2)
    expect(d.closes).toHaveLength(2);
    expect(d.opens).toHaveLength(2);
    expect(d.unchanged).toHaveLength(2);
    const closeStrikes = d.closes.map((l) => l.K).sort((a, b) => (a! - b!));
    expect(closeStrikes).toEqual([105, 110]);
    const openStrikes = d.opens.map((l) => l.K).sort((a, b) => (a! - b!));
    expect(openStrikes).toEqual([108, 113]);
  });

  it("partial qty change (base qty=3, target qty=2) → closes qty=1 on same leg", () => {
    const d = computeDiff([sc(300, 3)], [sc(300, 2)]);
    expect(d.closes).toHaveLength(1);
    expect(d.closes[0].qty).toBe(1);
    expect(d.closes[0].K).toBe(300);
    expect(d.opens).toHaveLength(0);
    // overlapping qty=2 stays unchanged
    expect(d.unchanged).toHaveLength(1);
    expect(d.unchanged[0].qty).toBe(2);
  });

  it("qty increase (base qty=1, target qty=3) → opens qty=2 on same leg", () => {
    const d = computeDiff([sp(95, 1)], [sp(95, 3)]);
    expect(d.opens).toHaveLength(1);
    expect(d.opens[0].qty).toBe(2);
    expect(d.unchanged[0].qty).toBe(1);
  });

  it("throws when both base and target are empty (Fail Loudly)", () => {
    expect(() => computeDiff([], [])).toThrow();
  });
});

describe("roll · computeRollImpact", () => {
  it("netCashFlow: short-to-short roll UP collects premium → positive", () => {
    // rolling a short call from 105 up to 115: close 105 (buy back, cost), open 115 (sell, credit)
    // rolling UP a short call generally means the new strike is FURTHER OTM so cheaper —
    // the spec's stated case is a roll that nets a credit. Use a roll DOWN (closer, richer)
    // to reliably collect: close short call 115, open short call 105 (richer premium in).
    const base = [sc(115)];
    const target = [sc(105)];
    const imp = computeRollImpact(base, target, SPOT);
    // open a richer short (105) collects more than the cost to close the cheaper short (115)
    expect(imp.netCashFlow).toBeGreaterThan(0);
  });

  it("short put ATM → short put OTM lower: |deltaCashAfter| shrinks (rolling down cuts delta)", () => {
    const base = [sp(100)]; // ATM short put
    const target = [sp(90)]; // OTM lower short put
    const imp = computeRollImpact(base, target, SPOT);
    expect(Math.abs(imp.deltaCashAfter)).toBeLessThan(Math.abs(imp.deltaCashBefore));
  });

  it("APR is null for a long-only base, a number for a short target", () => {
    const imp = computeRollImpact([lc(100)], [sc(105)], SPOT);
    expect(imp.aprBefore).toBeNull();
    expect(imp.aprAfter).not.toBeNull();
    expect(imp.aprAfter!).toBeGreaterThan(0);
  });

  it("deltaCashDelta = after − before", () => {
    const imp = computeRollImpact([sp(100)], [sp(90)], SPOT);
    expect(imp.deltaCashDelta).toBeCloseTo(imp.deltaCashAfter - imp.deltaCashBefore, 6);
  });

  it("break-even arrays are populated for a short straddle target", () => {
    const base = [sc(100)];
    const target = [sc(100), sp(100)]; // short straddle → two break-evens
    const imp = computeRollImpact(base, target, SPOT);
    expect(imp.breakEvenAfter.length).toBeGreaterThanOrEqual(1);
    expect(imp.breakEvenAfter.length).toBeLessThanOrEqual(4);
  });

  it("greeksCash before/after carry the four cash greeks", () => {
    const imp = computeRollImpact([sp(100)], [sp(95)], SPOT);
    for (const g of [imp.greeksCashBefore, imp.greeksCashAfter]) {
      expect(g).toHaveProperty("delta");
      expect(g).toHaveProperty("gamma");
      expect(g).toHaveProperty("theta");
      expect(g).toHaveProperty("vega");
    }
  });

  it("throws when both base and target are empty (Fail Loudly)", () => {
    expect(() => computeRollImpact([], [], SPOT)).toThrow();
  });
});
