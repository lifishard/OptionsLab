// Phase 7b · Decision Copilot rule table.
//
// Three questions in → deterministic candidate strategies out. This is NOT an
// LLM: a fixed 3×3×3 rule table (direction × timeframe × risk) picks 1-3
// strategy templates, then we snap each template's strikes to the REAL option
// chain and price max_gain / max_loss / break_even with the existing BSM engine
// (client/src/lib/strategies/payoff.ts). No fake numbers, ever.
//
// Constraints honoured:
//   - BSM engine (../options/bsm) and payoff engine are READ-ONLY reuse.
//   - The `Leg` type (../strategies/definitions) is READ-ONLY reuse.
//   - Every candidate leg's K must exist in the chain (snapped, never invented).

import type { Leg } from "../strategies/definitions";
import { STRATEGIES } from "../strategies/definitions";
import { entryCost, payoffAtExpiry } from "../strategies/payoff";

export type Direction = "up" | "down" | "flat" | "unsure";
export type Timeframe = "week" | "month" | "quarter";
export type RiskAppetite = "conservative" | "moderate" | "aggressive";

const R = 0.045; // risk-free rate — matches the rest of the app.

// ── Chain data shape (mirrors chain.tsx / server yfinance ChainSnapshot) ──
export interface CopilotOptionRow {
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  model: number;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  apr: number | null;
}
export interface CopilotStrikeRow {
  K: number;
  call: CopilotOptionRow;
  put: CopilotOptionRow;
}
export interface CopilotExpiryGroup {
  date: string;
  dte: number;
  strikes: CopilotStrikeRow[];
}
export interface OptionChainData {
  symbol: string;
  spot: number;
  changePercent: number;
  fetchedAt: number;
  expiries: CopilotExpiryGroup[];
}

export interface CopilotInput {
  direction: Direction;
  timeframe: Timeframe;
  risk: RiskAppetite;
  spot: number;
  chain: OptionChainData;
}

export interface Candidate {
  strategySlug: string;
  strategyName: string;
  laoouReason: string;
  legs: Leg[];
  expectedMaxGain: number | null; // null = unlimited (per 1 contract set, $)
  expectedMaxLoss: number | null; // null = unlimited ($, positive number)
  breakEvens: number[];
  probabilityITM?: number; // delta-approximated, 0..1
}

// ── Timeframe → minimum DTE we want the expiry to have ──
const MIN_DTE: Record<Timeframe, number> = {
  week: 7,
  month: 30,
  quarter: 60,
};

/** Pick the nearest expiry whose DTE ≥ target; fall back to the longest we have. */
export function pickExpiry(chain: OptionChainData, timeframe: Timeframe): CopilotExpiryGroup {
  if (!chain.expiries || chain.expiries.length === 0) {
    throw new Error("期权链没有到期日");
  }
  const want = MIN_DTE[timeframe];
  const sorted = [...chain.expiries].sort((a, b) => a.dte - b.dte);
  const hit = sorted.find((e) => e.dte >= want);
  return hit ?? sorted[sorted.length - 1];
}

/** Snap an arbitrary target strike to the closest strike that actually trades in this expiry. */
export function nearestStrike(expiry: CopilotExpiryGroup, target: number): number {
  if (!expiry.strikes.length) throw new Error("这个到期日没有行权价");
  let best = expiry.strikes[0].K;
  let bestDist = Math.abs(best - target);
  for (const s of expiry.strikes) {
    const d = Math.abs(s.K - target);
    if (d < bestDist) {
      bestDist = d;
      best = s.K;
    }
  }
  return best;
}

/** Representative IV for the expiry — average of the ATM-ish rows, fallback 0.30. */
function expiryIV(expiry: CopilotExpiryGroup, spot: number): number {
  const withIv = expiry.strikes
    .filter((s) => s.call.iv || s.put.iv)
    .map((s) => {
      const ivs = [s.call.iv, s.put.iv].filter((v): v is number => v != null && v > 0);
      const avg = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
      return { K: s.K, iv: avg };
    })
    .filter((x): x is { K: number; iv: number } => x.iv != null);
  if (!withIv.length) return 0.3;
  // weight toward strikes near spot
  withIv.sort((a, b) => Math.abs(a.K - spot) - Math.abs(b.K - spot));
  const near = withIv.slice(0, Math.min(4, withIv.length));
  return near.reduce((a, b) => a + b.iv, 0) / near.length;
}

/** One standard-deviation move over the expiry's horizon: spot × IV × √(dte/365). */
export function oneSigma(spot: number, iv: number, dte: number): number {
  return spot * iv * Math.sqrt(Math.max(dte, 1) / 365);
}

/** Lookup the traded row for a strike (must exist). */
function rowAt(expiry: CopilotExpiryGroup, K: number): CopilotStrikeRow {
  const r = expiry.strikes.find((s) => s.K === K);
  if (!r) throw new Error(`行权价 ${K} 不在链上`);
  return r;
}

// ── Priced metrics: scan a payoff grid to extract max gain / loss / break-evens ──
export interface PricedMetrics {
  expectedMaxGain: number | null;
  expectedMaxLoss: number | null;
  breakEvens: number[];
}

/**
 * Price a leg set at the near expiry. Values are per ONE contract-set in dollars
 * (per-share payoff × 100). Grid runs 0 → 3×spot. A near-flat tail at the top or
 * bottom of the grid that keeps trending is treated as unbounded (null).
 */
export function priceCandidate(
  legs: Leg[],
  spot: number,
  dte: number,
  iv: number,
): PricedMetrics {
  const T = Math.max(dte, 1) / 365;
  const cost = entryCost(legs, spot, T, R, iv);

  const hi = spot * 3;
  const steps = 600;
  const dx = hi / steps;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const S = i * dx;
    xs.push(S);
    ys.push(payoffAtExpiry(S, legs, cost, R, iv) * 100);
  }

  let maxGain = -Infinity;
  let maxLoss = Infinity; // most-negative payoff
  for (const y of ys) {
    if (y > maxGain) maxGain = y;
    if (y < maxLoss) maxLoss = y;
  }

  // Unbounded detection: does payoff keep rising toward the top of the grid,
  // or keep falling toward S=0? Compare slope of the last / first segments.
  const topSlope = ys[steps] - ys[steps - 1];
  const botSlope = ys[1] - ys[0];
  const gainUnbounded = topSlope > 1e-3 && ys[steps] >= maxGain - 1e-6;
  // Losses grow as S→∞ (short call side) OR as S→0 (nothing below 0, so bottom
  // is capped). Only the upside tail can be truly unbounded for equity options.
  const lossUnbounded = topSlope < -1e-3 && ys[steps] <= maxLoss + 1e-6;

  // Break-evens: sign changes of payoff along the grid.
  const breakEvens: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const a = ys[i - 1];
    const b = ys[i];
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) {
      // linear interpolate
      const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) || 1);
      breakEvens.push(Number((xs[i - 1] + t * dx).toFixed(2)));
    }
  }

  return {
    expectedMaxGain: gainUnbounded ? null : Number(maxGain.toFixed(0)),
    expectedMaxLoss: lossUnbounded ? null : Number(Math.abs(Math.min(maxLoss, 0)).toFixed(0)),
    breakEvens,
  };
}

/** Delta-based P(finish ITM) approximation for the primary short/long leg. */
function probabilityITM(row: CopilotStrikeRow, type: "call" | "put"): number | undefined {
  const d = type === "call" ? row.call.delta : row.put.delta;
  if (d == null) return undefined;
  // |delta| ≈ risk-neutral P(ITM). For a short option, prob of KEEPING premium
  // ≈ 1 − |delta|; callers phrase the reason accordingly.
  return Math.min(0.99, Math.max(0.01, Math.abs(d)));
}

// ── Template builders. Each returns a fully-priced Candidate or throws. ──

function nameOf(slug: string): string {
  const def = STRATEGIES[slug];
  return def ? `${def.nameZh} · ${def.nameEn}` : slug;
}

function build(
  slug: string,
  reason: string,
  legs: Leg[],
  spot: number,
  dte: number,
  iv: number,
  probLeg?: { row: CopilotStrikeRow; type: "call" | "put"; keepPremium?: boolean },
): Candidate {
  const m = priceCandidate(legs, spot, dte, iv);
  let prob: number | undefined;
  if (probLeg) {
    const p = probabilityITM(probLeg.row, probLeg.type);
    if (p != null) prob = probLeg.keepPremium ? 1 - p : p;
  }
  return {
    strategySlug: slug,
    strategyName: nameOf(slug),
    laoouReason: reason,
    legs,
    expectedMaxGain: m.expectedMaxGain,
    expectedMaxLoss: m.expectedMaxLoss,
    breakEvens: m.breakEvens,
    probabilityITM: prob,
  };
}

// ─────────────────────────────────────────────────────────────
// The rule table. Returns 2-3 candidates for the given input.
// ─────────────────────────────────────────────────────────────
export function recommendStrategies(input: CopilotInput): Candidate[] {
  const { direction, timeframe, risk, chain } = input;
  const spot = input.spot;

  // Fail loudly — the UI turns these into "先在期权链看板选一个标的".
  if (!chain || !chain.expiries || chain.expiries.length === 0) {
    throw new Error("期权链数据还没加载，先在期权链看板选一个标的。");
  }
  if (!spot || spot <= 0) {
    throw new Error("现价无效 (spot=0)，先在期权链看板选一个标的。");
  }

  const exp = pickExpiry(chain, timeframe);
  const dte = exp.dte;
  const iv = expiryIV(exp, spot);
  const sigma1 = oneSigma(spot, iv, dte);

  const candidates: Candidate[] = [];

  const snap = (target: number) => nearestStrike(exp, target);

  if (direction === "up") {
    if (risk === "conservative") {
      // Cash-Secured Put: sell a -0.5σ put, collect premium.
      const K = snap(spot - 0.5 * sigma1);
      const row = rowAt(exp, K);
      candidates.push(
        build(
          "cash-secured-put",
          `看涨但想稳当？卖一张 ${K} 的 Put 先收租。真跌到这个价你就当打折接货，接不到就白赚权利金——两头不亏心。`,
          [{ type: "put", side: "short", K, qty: 1 }],
          spot,
          dte,
          iv,
          { row, type: "put", keepPremium: true },
        ),
      );
      // Second, gentler option: bull put spread for a defined-risk credit.
      const kShort = snap(spot - 0.5 * sigma1);
      const kLong = snap(spot - 1.2 * sigma1);
      if (kLong < kShort) {
        candidates.push(
          build(
            "bull-put-spread",
            `嫌裸卖 Put 心里没底？在 ${kLong} 再买一张 Put 兜底，最大亏损锁死。收的少一点，但睡得着。`,
            [
              { type: "put", side: "short", K: kShort, qty: 1 },
              { type: "put", side: "long", K: kLong, qty: 1 },
            ],
            spot,
            dte,
            iv,
            { row: rowAt(exp, kShort), type: "put", keepPremium: true },
          ),
        );
      }
    } else if (risk === "aggressive") {
      // Long Call OTM ~0.3 delta — small bet, big upside.
      const K = snap(spot + 0.8 * sigma1);
      candidates.push(
        build(
          "long-call",
          `愿意赌大的？买一张 ${K} 的价外 Call，小钱押大方向。赌对了天花板很高，赌错最多赔掉这点权利金——但记住：得涨得够快。`,
          [{ type: "call", side: "long", K, qty: 1 }],
          spot,
          dte,
          iv,
          { row: rowAt(exp, K), type: "call" },
        ),
      );
      // Also a bull call spread so it's not a single all-in.
      const kL = snap(spot);
      const kS = snap(spot + 1.2 * sigma1);
      if (kS > kL) {
        candidates.push(
          build(
            "bull-call-spread",
            `想激进又不想纯梭哈？买 ${kL} Call、卖 ${kS} Call。成本砍一刀，收益封个顶，胜率高一截。`,
            [
              { type: "call", side: "long", K: kL, qty: 1 },
              { type: "call", side: "short", K: kS, qty: 1 },
            ],
            spot,
            dte,
            iv,
          ),
        );
      }
    } else {
      // moderate
      if (timeframe === "quarter") {
        // Long Call ITM ~0.7 delta.
        const K = snap(spot - 0.5 * sigma1);
        candidates.push(
          build(
            "long-call",
            `看多、给够时间？买一张 ${K} 的实值 Call（约 0.7 Delta），像持股但省本金，Theta 也没那么咬人。`,
            [{ type: "call", side: "long", K, qty: 1 }],
            spot,
            dte,
            iv,
            { row: rowAt(exp, K), type: "call" },
          ),
        );
      }
      // Bull Call Spread (ATM/OTM) — the workhorse for moderate bulls.
      const kL = snap(spot);
      const kS = snap(spot + 1.0 * sigma1);
      if (kS > kL) {
        candidates.push(
          build(
            "bull-call-spread",
            `温和看涨的标准动作：买 ${kL} Call、卖 ${kS} Call。用「封顶收益」换「更低成本 + 更高胜率」，慢牛行情最舒服。`,
            [
              { type: "call", side: "long", K: kL, qty: 1 },
              { type: "call", side: "short", K: kS, qty: 1 },
            ],
            spot,
            dte,
            iv,
          ),
        );
      }
      // add a conservative income alt so we always have ≥2
      const kp = snap(spot - 0.6 * sigma1);
      candidates.push(
        build(
          "cash-secured-put",
          `不着急冲？也可以卖一张 ${kp} 的 Put 收租，跌到就接货。当作「边等边赚」的备选。`,
          [{ type: "put", side: "short", K: kp, qty: 1 }],
          spot,
          dte,
          iv,
          { row: rowAt(exp, kp), type: "put", keepPremium: true },
        ),
      );
    }
  } else if (direction === "down") {
    if (risk === "aggressive") {
      // Long Put OTM (cash).
      const K = snap(spot - 0.8 * sigma1);
      candidates.push(
        build(
          "long-put",
          `笃定要跌、愿意赌？买一张 ${K} 的价外 Put，亏损封死在权利金上。但股价最多跌到 0，盈利有上限，别贪。`,
          [{ type: "put", side: "long", K, qty: 1 }],
          spot,
          dte,
          iv,
          { row: rowAt(exp, K), type: "put" },
        ),
      );
      const kL = snap(spot);
      const kS = snap(spot - 1.2 * sigma1);
      if (kS < kL) {
        candidates.push(
          build(
            "bear-put-spread",
            `想激进但控成本？买 ${kL} Put、卖 ${kS} Put，摊低成本、封个顶。`,
            [
              { type: "put", side: "long", K: kL, qty: 1 },
              { type: "put", side: "short", K: kS, qty: 1 },
            ],
            spot,
            dte,
            iv,
          ),
        );
      }
    } else {
      // conservative / moderate → Bear Put Spread (defined risk).
      const kL = snap(spot);
      const kS = snap(spot - 1.0 * sigma1);
      if (kS < kL) {
        candidates.push(
          build(
            "bear-put-spread",
            `看跌但不赌崩盘：买 ${kL} Put、卖 ${kS} Put。用封顶收益换更低成本、更高胜率，温和阴跌最合适。`,
            [
              { type: "put", side: "long", K: kL, qty: 1 },
              { type: "put", side: "short", K: kS, qty: 1 },
            ],
            spot,
            dte,
            iv,
          ),
        );
      }
      // credit alternative: bear call spread
      const kcS = snap(spot + 0.6 * sigma1);
      const kcL = snap(spot + 1.5 * sigma1);
      if (kcL > kcS) {
        candidates.push(
          build(
            "bear-call-spread",
            `换个收租的姿势：卖 ${kcS} Call、买 ${kcL} Call。赌它「涨不过上方那道墙」，横着或小跌都能赢。`,
            [
              { type: "call", side: "short", K: kcS, qty: 1 },
              { type: "call", side: "long", K: kcL, qty: 1 },
            ],
            spot,
            dte,
            iv,
            { row: rowAt(exp, kcS), type: "call", keepPremium: true },
          ),
        );
      }
    }
  } else if (direction === "flat") {
    if (risk === "conservative") {
      // Iron Condor ±1σ.
      const putShort = snap(spot - 1.0 * sigma1);
      const putLong = snap(spot - 1.8 * sigma1);
      const callShort = snap(spot + 1.0 * sigma1);
      const callLong = snap(spot + 1.8 * sigma1);
      candidates.push(
        build(
          "iron-condor",
          `横盘收租之王：在 ±1σ 卖两腿收租，两翼各买一张封死风险。赌它在 ${putShort}–${callShort} 之间晃悠，赚够一半就走。`,
          [
            { type: "put", side: "long", K: putLong, qty: 1 },
            { type: "put", side: "short", K: putShort, qty: 1 },
            { type: "call", side: "short", K: callShort, qty: 1 },
            { type: "call", side: "long", K: callLong, qty: 1 },
          ],
          spot,
          dte,
          iv,
        ),
      );
    } else if (risk === "moderate") {
      // Short Strangle ±1σ.
      const putShort = snap(spot - 1.0 * sigma1);
      const callShort = snap(spot + 1.0 * sigma1);
      candidates.push(
        build(
          "short-strangle",
          `赌区间震荡：卖 ${putShort} Put + 卖 ${callShort} Call，容错空间比跨式大。但两边都是裸卖——大行情来了会疼，要有纪律。`,
          [
            { type: "put", side: "short", K: putShort, qty: 1 },
            { type: "call", side: "short", K: callShort, qty: 1 },
          ],
          spot,
          dte,
          iv,
        ),
      );
      // safer companion: iron condor
      const putLong = snap(spot - 1.8 * sigma1);
      const callLong = snap(spot + 1.8 * sigma1);
      candidates.push(
        build(
          "iron-condor",
          `嫌裸卖太吓人？把上面那个宽跨加两翼保险，变成铁鹰，风险锁死一样收租。`,
          [
            { type: "put", side: "long", K: putLong, qty: 1 },
            { type: "put", side: "short", K: putShort, qty: 1 },
            { type: "call", side: "short", K: callShort, qty: 1 },
            { type: "call", side: "long", K: callLong, qty: 1 },
          ],
          spot,
          dte,
          iv,
        ),
      );
    } else {
      // aggressive → Short Straddle ATM.
      const K = snap(spot);
      candidates.push(
        build(
          "short-straddle",
          `笃定它彻底不动？在 ${K} 同时卖 Call 和 Put，收双份租。⚠️ 涨那侧亏损无上限——这是赔率最不对称的玩法，只适合老手 + 盯盘。`,
          [
            { type: "call", side: "short", K, qty: 1 },
            { type: "put", side: "short", K, qty: 1 },
          ],
          spot,
          dte,
          iv,
        ),
      );
      const callLong = snap(spot + 1.8 * sigma1);
      const putLong = snap(spot - 1.8 * sigma1);
      const putShort = snap(spot - 0.8 * sigma1);
      const callShort = snap(spot + 0.8 * sigma1);
      candidates.push(
        build(
          "iron-condor",
          `想收租又想睡着觉？改成铁鹰：${putShort}/${callShort} 收租、两翼买保险，风险有底。`,
          [
            { type: "put", side: "long", K: putLong, qty: 1 },
            { type: "put", side: "short", K: putShort, qty: 1 },
            { type: "call", side: "short", K: callShort, qty: 1 },
            { type: "call", side: "long", K: callLong, qty: 1 },
          ],
          spot,
          dte,
          iv,
        ),
      );
    }
  } else {
    // direction === "unsure" → recommend all three, including "空仓" advice.
    const K = snap(spot);
    candidates.push(
      build(
        "long-straddle",
        `说不准方向、但觉得「要动」？在 ${K} 同时买 Call 和 Put。你不押方向，只押幅度——只要动得够大，哪边都行。最怕横盘。`,
        [
          { type: "call", side: "long", K, qty: 1 },
          { type: "put", side: "long", K, qty: 1 },
        ],
        spot,
        dte,
        iv,
      ),
    );
    const putShort = snap(spot - 1.0 * sigma1);
    const putLong = snap(spot - 1.8 * sigma1);
    const callShort = snap(spot + 1.0 * sigma1);
    const callLong = snap(spot + 1.8 * sigma1);
    candidates.push(
      build(
        "iron-condor",
        `如果你其实觉得它「哪都不去」，那就反过来收租：铁鹰在 ${putShort}–${callShort} 之间赚 Theta。`,
        [
          { type: "put", side: "long", K: putLong, qty: 1 },
          { type: "put", side: "short", K: putShort, qty: 1 },
          { type: "call", side: "short", K: callShort, qty: 1 },
          { type: "call", side: "long", K: callLong, qty: 1 },
        ],
        spot,
        dte,
        iv,
      ),
    );
    // Third: the honest "空仓" nudge, packaged as a no-leg advisory candidate.
    candidates.push({
      strategySlug: "cash",
      strategyName: "空仓 · Sit in Cash",
      laoouReason:
        "最诚实的建议：你连方向都说不准，可能这单本来就不该开。别拍脑袋开仓——空着仓等一个你真看得懂的机会，也是一种交易。",
      legs: [],
      expectedMaxGain: 0,
      expectedMaxLoss: 0,
      breakEvens: [],
    });
  }

  // Safety net: guarantee at least one candidate for every combination.
  if (candidates.length === 0) {
    const K = snap(spot);
    candidates.push(
      build(
        "long-call",
        `先给你一个最基础的方向票：买一张 ${K} 的 Call。`,
        [{ type: "call", side: "long", K, qty: 1 }],
        spot,
        dte,
        iv,
        { row: rowAt(exp, K), type: "call" },
      ),
    );
  }

  return candidates.slice(0, 3);
}
