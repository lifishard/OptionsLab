import { describe, it, expect } from "vitest";
import {
  recommendStrategies,
  pickExpiry,
  nearestStrike,
  oneSigma,
  type OptionChainData,
  type CopilotExpiryGroup,
  type Direction,
  type Timeframe,
  type RiskAppetite,
} from "./rules";
import { bsmPrice } from "../options/bsm";
import { delta as bsmDelta } from "../options/greeks";

// ── Build a realistic synthetic chain (SPY-like, spot 300, 5-point strikes) ──
const R = 0.045;
function buildExpiry(spot: number, dte: number, iv: number): CopilotExpiryGroup {
  const T = dte / 365;
  const strikes = [];
  for (let K = spot - 60; K <= spot + 60; K += 5) {
    const callMid = bsmPrice({ S: spot, K, T, r: R, sigma: iv, type: "call" });
    const putMid = bsmPrice({ S: spot, K, T, r: R, sigma: iv, type: "put" });
    strikes.push({
      K,
      call: {
        strike: K, bid: callMid * 0.98, ask: callMid * 1.02, mid: callMid, model: callMid,
        iv, delta: bsmDelta({ S: spot, K, T, r: R, sigma: iv, type: "call" }),
        gamma: 0, theta: -0.01, vega: 0.1, apr: 5,
      },
      put: {
        strike: K, bid: putMid * 0.98, ask: putMid * 1.02, mid: putMid, model: putMid,
        iv, delta: bsmDelta({ S: spot, K, T, r: R, sigma: iv, type: "put" }),
        gamma: 0, theta: -0.01, vega: 0.1, apr: 5,
      },
    });
  }
  const date = new Date(Date.now() + dte * 86400000).toISOString().slice(0, 10);
  return { date, dte, strikes };
}

const SPOT = 300;
const chain: OptionChainData = {
  symbol: "SPY",
  spot: SPOT,
  changePercent: 0.3,
  fetchedAt: Date.now(),
  expiries: [
    buildExpiry(SPOT, 10, 0.2),
    buildExpiry(SPOT, 35, 0.22),
    buildExpiry(SPOT, 75, 0.25),
  ],
};

const chainStrikeSet = new Set<number>();
chain.expiries.forEach((e) => e.strikes.forEach((s) => chainStrikeSet.add(s.K)));

const DIRECTIONS: Direction[] = ["up", "down", "flat", "unsure"];
const TIMEFRAMES: Timeframe[] = ["week", "month", "quarter"];
const RISKS: RiskAppetite[] = ["conservative", "moderate", "aggressive"];

describe("copilot rules · helpers", () => {
  it("pickExpiry honours the timeframe minimum DTE", () => {
    expect(pickExpiry(chain, "week").dte).toBe(10);
    expect(pickExpiry(chain, "month").dte).toBe(35);
    expect(pickExpiry(chain, "quarter").dte).toBe(75);
  });

  it("nearestStrike snaps to a strike that exists on the chain", () => {
    const exp = chain.expiries[1];
    const k = nearestStrike(exp, 302.3);
    expect(chainStrikeSet.has(k)).toBe(true);
    expect(k).toBe(300);
  });

  it("oneSigma scales with IV and sqrt(time)", () => {
    const s = oneSigma(300, 0.2, 365);
    expect(s).toBeCloseTo(60, 5); // 300 * 0.2 * 1
  });
});

describe("copilot rules · coverage", () => {
  it("every direction/timeframe/risk combo returns ≥1 candidate", () => {
    for (const direction of DIRECTIONS) {
      for (const timeframe of TIMEFRAMES) {
        for (const risk of RISKS) {
          const out = recommendStrategies({ direction, timeframe, risk, spot: SPOT, chain });
          expect(out.length).toBeGreaterThanOrEqual(1);
          expect(out.length).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("up + conservative includes Cash-Secured Put", () => {
    const out = recommendStrategies({ direction: "up", timeframe: "month", risk: "conservative", spot: SPOT, chain });
    expect(out.some((c) => c.strategySlug === "cash-secured-put")).toBe(true);
  });

  it("down + aggressive includes Long Put", () => {
    const out = recommendStrategies({ direction: "down", timeframe: "week", risk: "aggressive", spot: SPOT, chain });
    expect(out.some((c) => c.strategySlug === "long-put")).toBe(true);
  });

  it("flat + conservative includes Iron Condor", () => {
    const out = recommendStrategies({ direction: "flat", timeframe: "month", risk: "conservative", spot: SPOT, chain });
    expect(out.some((c) => c.strategySlug === "iron-condor")).toBe(true);
  });

  it("flat + aggressive includes Short Straddle", () => {
    const out = recommendStrategies({ direction: "flat", timeframe: "month", risk: "aggressive", spot: SPOT, chain });
    expect(out.some((c) => c.strategySlug === "short-straddle")).toBe(true);
  });

  it("unsure returns three candidates including a cash (空仓) advisory", () => {
    const out = recommendStrategies({ direction: "unsure", timeframe: "month", risk: "moderate", spot: SPOT, chain });
    expect(out.length).toBe(3);
    expect(out.some((c) => c.strategySlug === "cash")).toBe(true);
  });

  it("every candidate leg strike exists on the chain (never invented)", () => {
    for (const direction of DIRECTIONS) {
      for (const timeframe of TIMEFRAMES) {
        for (const risk of RISKS) {
          const out = recommendStrategies({ direction, timeframe, risk, spot: SPOT, chain });
          for (const c of out) {
            for (const leg of c.legs) {
              if (leg.type === "stock") continue;
              expect(leg.K).toBeDefined();
              expect(chainStrikeSet.has(leg.K as number)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("defined-risk strategies report a finite max loss", () => {
    // Bull call spread (up/moderate/month) is bounded both ways.
    const out = recommendStrategies({ direction: "up", timeframe: "month", risk: "moderate", spot: SPOT, chain });
    const spread = out.find((c) => c.strategySlug === "bull-call-spread");
    expect(spread).toBeTruthy();
    expect(spread!.expectedMaxLoss).not.toBeNull();
    expect(Number.isFinite(spread!.expectedMaxLoss as number)).toBe(true);
    // Iron condor is fully defined-risk on both wings.
    const ic = recommendStrategies({ direction: "flat", timeframe: "month", risk: "conservative", spot: SPOT, chain })
      .find((c) => c.strategySlug === "iron-condor");
    expect(ic!.expectedMaxLoss).not.toBeNull();
    expect(ic!.expectedMaxGain).not.toBeNull();
  });

  it("a long call reports finite (bounded) max loss = premium and unbounded gain", () => {
    const out = recommendStrategies({ direction: "up", timeframe: "quarter", risk: "aggressive", spot: SPOT, chain });
    const lc = out.find((c) => c.strategySlug === "long-call");
    expect(lc).toBeTruthy();
    expect(lc!.expectedMaxLoss).not.toBeNull(); // premium is capped
    expect(lc!.expectedMaxGain).toBeNull(); // upside unbounded
  });

  it("fails loudly on empty chain / zero spot", () => {
    expect(() => recommendStrategies({ direction: "up", timeframe: "week", risk: "moderate", spot: 0, chain })).toThrow();
    const empty: OptionChainData = { ...chain, expiries: [] };
    expect(() => recommendStrategies({ direction: "up", timeframe: "week", risk: "moderate", spot: SPOT, chain: empty })).toThrow();
  });
});
