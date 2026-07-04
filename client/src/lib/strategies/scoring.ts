// Scenario Navigator scoring — a PURE function that ranks the 32 strategies
// against a user's 4-question market view. No side effects, no I/O.
// Weights: direction 40, vol 25, time 15, risk 20. See scoring.test.ts.

import { STRATEGIES, STRATEGY_ORDER, type StrategyDef } from "./definitions";

export type ScenarioQuery = {
  direction: "strong-bull" | "mild-bull" | "neutral" | "mild-bear" | "strong-bear";
  vol: "vol-up" | "vol-flat" | "vol-down" | "vol-any";
  time: "near-term" | "mid-term" | "long-term" | "time-any";
  risk: "income" | "directional" | "hedge" | "defined-risk" | "risk-any";
};

export type ScoredStrategy = {
  slug: string;
  score: number; // 0-100
  reasons: string[]; // 2-3 short 老欧-voice explanations
};

// Direction match: which strategy `bias` values are exact vs adjacent for each query.
// Exact = +40, adjacent = +20, otherwise 0.
const DIRECTION_MAP: Record<
  ScenarioQuery["direction"],
  { exact: StrategyDef["bias"][]; adjacent: StrategyDef["bias"][] }
> = {
  // A strong-directional view is well-served by BOTH the pure and the -mild flavor
  // of that side, so both count as exact; the opposite-strength side is adjacent.
  "strong-bull": { exact: ["bull", "bull-mild"], adjacent: [] },
  "mild-bull": { exact: ["bull-mild"], adjacent: ["bull"] },
  neutral: { exact: ["neutral", "low-vol"], adjacent: ["high-vol"] },
  "mild-bear": { exact: ["bear-mild"], adjacent: ["bear"] },
  "strong-bear": { exact: ["bear", "bear-mild"], adjacent: [] },
};

// Human labels for the direction (used to compose reasons).
const DIR_LABEL: Record<ScenarioQuery["direction"], string> = {
  "strong-bull": "强烈看涨",
  "mild-bull": "温和看涨",
  neutral: "中性震荡",
  "mild-bear": "温和看跌",
  "strong-bear": "强烈看跌",
};

// Credit / income strategies (bias neutral OR classic premium-collectors).
const INCOME_SLUGS = new Set([
  "bull-put-spread",
  "bear-call-spread",
  "iron-condor",
  "iron-butterfly",
  "cash-secured-put",
  "covered-call",
  "short-strangle",
  "short-straddle",
  "jade-lizard",
]);

const DIRECTIONAL_SLUGS = new Set([
  "long-call",
  "long-put",
  "bull-call-spread",
  "bear-put-spread",
  "synthetic-long",
  "call-ratio-backspread",
]);

const HEDGE_SLUGS = new Set(["protective-put", "collar", "zero-cost-collar", "married-put"]);

// LEAPS-flavored / long-dated strategies (penalized for near-term, boosted for long-term).
const LEAPS_SLUGS = new Set(["pmcc", "diagonal-call", "long-box-spread"]);
// Pure short-dated bets (penalized for long-term).
const SHORT_DATED_SLUGS = new Set(["short-strangle", "short-straddle"]);
// Naked / undefined-risk positions — demoted when the user asked for defined risk.
const NAKED_RISK_SLUGS = new Set([
  "short-call",
  "short-put",
  "short-straddle",
  "short-strangle",
  "call-ratio-spread",
  "put-ratio-spread",
]);
// Extra strategies boosted for long-term horizon.
const LONG_TERM_BOOST_SLUGS = new Set([
  "pmcc",
  "diagonal-call",
  "long-calendar-call",
  "long-calendar-put",
  "protective-put",
]);

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function scoreStrategies(query: ScenarioQuery): ScoredStrategy[] {
  const results: ScoredStrategy[] = [];

  for (const slug of STRATEGY_ORDER) {
    const def = STRATEGIES[slug];
    if (!def) continue;

    let score = 0;
    const reasons: string[] = [];
    const vega = def.greekSignature.vega;
    const theta = def.greekSignature.theta;

    // ── Direction (weight 40) ──
    const dir = DIRECTION_MAP[query.direction];
    if (dir.exact.includes(def.bias)) {
      score += 40;
      reasons.push(`方向对拍 · ${DIR_LABEL[query.direction]}`);
    } else if (dir.adjacent.includes(def.bias)) {
      score += 20;
      reasons.push(`方向沾边 · ${DIR_LABEL[query.direction]}`);
    }

    // ── Vol (weight 25) ──
    if (query.vol === "vol-up") {
      if (vega === "+") {
        score += 25;
        reasons.push("你赌 IV 涨 · 做多 Vega 受益");
      } else if (vega === "-") {
        score -= 10;
      }
    } else if (query.vol === "vol-down") {
      if (vega === "-") {
        score += 25;
        reasons.push("你赌 IV 崩 · 卖 Vega 收租");
      } else if (vega === "+") {
        score -= 10;
      }
    } else if (query.vol === "vol-flat") {
      if (vega === "0" || vega === "±") {
        score += 15;
        reasons.push("IV 稳 · Vega 敞口小");
      } else {
        score += 5;
      }
    }

    // ── Time (weight 15) ──
    if (query.time === "near-term") {
      if (theta === "+" || theta === "-") {
        score += 15;
        reasons.push("短线 · 吃 Theta 的快节奏");
      }
      if (LEAPS_SLUGS.has(slug)) score -= 10;
    } else if (query.time === "mid-term") {
      score += 10;
    } else if (query.time === "long-term") {
      if (LONG_TERM_BOOST_SLUGS.has(slug)) {
        score += 15;
        reasons.push("时间偏长 · 用远月替代股票");
      }
      if (SHORT_DATED_SLUGS.has(slug)) score -= 5;
    }

    // ── Risk (weight 20) ──
    if (query.risk === "income") {
      if (INCOME_SLUGS.has(slug)) {
        // Classic credit-collectors — the real 收租之王.
        score += 20;
        reasons.push("你想收租 · 卖权利金的活");
        // Naked, unlimited-risk sells are the last thing to hand a 收租 seeker.
        if (slug === "short-straddle" || slug === "short-strangle") score -= 5;
        // Iron condor is the canonical defined-risk range收租 play — nudge it ahead.
        if (slug === "iron-condor") score += 2;
      } else if (def.bias === "neutral") {
        // Neutral debit structures fit income too, but less directly.
        score += 5;
        reasons.push("中性结构 · 也能吃时间价值");
      }
    } else if (query.risk === "directional") {
      if (DIRECTIONAL_SLUGS.has(slug)) {
        score += 20;
        reasons.push("你要方向 · 盈利空间敞开");
      }
    } else if (query.risk === "hedge") {
      if (HEDGE_SLUGS.has(slug)) {
        score += 20;
        reasons.push("上保险 · 给持仓封底");
      }
    } else if (query.risk === "defined-risk") {
      if (
        def.category === "butterfly" ||
        def.category === "condor" ||
        def.category === "vertical"
      ) {
        // Weight-20 match: spreads / flies / condors ARE the defined-risk structures.
        score += 20;
        reasons.push("定点风险 · 最大盈亏都算得死死的");
      } else if (NAKED_RISK_SLUGS.has(slug)) {
        // You asked for defined risk — naked positions are the opposite of that.
        score -= 15;
      } else if (def.category === "single-leg-covered") {
        // Covered / cash-secured singles are 收租 plays, not precise defined-risk structures.
        score -= 10;
      }
    }

    score = clamp(score);
    results.push({ slug, score, reasons: reasons.slice(0, 3) });
  }

  results.sort((a, b) => b.score - a.score);

  // Keep everything scoring >= 30 (capped at 6). If fewer than 3 clear the bar,
  // backfill with the next-highest so we always show at least 3 (spec: min 3).
  const strong = results.filter((r) => r.score >= 30);
  if (strong.length >= 3) return strong.slice(0, 6);
  return results.slice(0, 3);
}
