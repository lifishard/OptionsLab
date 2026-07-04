import { describe, it, expect } from "vitest";
import { scoreStrategies, type ScenarioQuery } from "../scoring";

const topSlugs = (q: ScenarioQuery, n: number) =>
  scoreStrategies(q).slice(0, n).map((r) => r.slug);

describe("scoreStrategies", () => {
  it("strong-bull + IV崩 + defined-risk → Bull Call Spread in top 3", () => {
    const q: ScenarioQuery = {
      direction: "strong-bull",
      vol: "vol-down",
      time: "mid-term",
      risk: "defined-risk",
    };
    expect(topSlugs(q, 3)).toContain("bull-call-spread");
  });

  it("neutral + IV稳定 + income → Iron Condor ranks #1", () => {
    const q: ScenarioQuery = {
      direction: "neutral",
      vol: "vol-flat",
      time: "mid-term",
      risk: "income",
    };
    expect(scoreStrategies(q)[0].slug).toBe("iron-condor");
  });

  it("strong-bear + directional → Long Put or Bear Put Spread in top 3", () => {
    const q: ScenarioQuery = {
      direction: "strong-bear",
      vol: "vol-any",
      time: "time-any",
      risk: "directional",
    };
    const top = topSlugs(q, 3);
    expect(top.some((s) => s === "long-put" || s === "bear-put-spread")).toBe(true);
  });

  it("every query returns at least 3 results", () => {
    const directions: ScenarioQuery["direction"][] = [
      "strong-bull",
      "mild-bull",
      "neutral",
      "mild-bear",
      "strong-bear",
    ];
    const vols: ScenarioQuery["vol"][] = ["vol-up", "vol-flat", "vol-down", "vol-any"];
    const times: ScenarioQuery["time"][] = ["near-term", "mid-term", "long-term", "time-any"];
    const risks: ScenarioQuery["risk"][] = [
      "income",
      "directional",
      "hedge",
      "defined-risk",
      "risk-any",
    ];
    for (const direction of directions)
      for (const vol of vols)
        for (const time of times)
          for (const risk of risks) {
            const res = scoreStrategies({ direction, vol, time, risk });
            expect(res.length).toBeGreaterThanOrEqual(3);
          }
  });

  it("results are sorted descending and capped at 6", () => {
    const res = scoreStrategies({
      direction: "neutral",
      vol: "vol-down",
      time: "mid-term",
      risk: "income",
    });
    expect(res.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < res.length; i++) {
      expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
    }
  });
});
