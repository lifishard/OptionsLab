import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, RotateCcw, ChevronRight, Compass } from "lucide-react";
import { STRATEGIES, type StrategyDef, type Leg } from "@/lib/strategies/definitions";
import { payoffAtExpiry, entryCost } from "@/lib/strategies/payoff";
import { scoreStrategies, type ScenarioQuery } from "@/lib/strategies/scoring";

const REF = { S0: 100, T: 30 / 365, r: 0.045, sigma: 0.3 };

// ── Question option definitions (value + human label) ──
const Q1: { value: ScenarioQuery["direction"]; label: string }[] = [
  { value: "strong-bull", label: "强烈看涨" },
  { value: "mild-bull", label: "温和看涨" },
  { value: "neutral", label: "中性 · 震荡" },
  { value: "mild-bear", label: "温和看跌" },
  { value: "strong-bear", label: "强烈看跌" },
];
const Q2: { value: ScenarioQuery["vol"]; label: string }[] = [
  { value: "vol-up", label: "IV 会大涨" },
  { value: "vol-flat", label: "IV 稳定" },
  { value: "vol-down", label: "IV 会崩" },
  { value: "vol-any", label: "不确定 · 忽略" },
];
const Q3: { value: ScenarioQuery["time"]; label: string }[] = [
  { value: "near-term", label: "短期 · 1-2 周" },
  { value: "mid-term", label: "中期 · 1-2 月" },
  { value: "long-term", label: "长期 · 3-12 月" },
  { value: "time-any", label: "不确定 · 忽略" },
];
const Q4: { value: ScenarioQuery["risk"]; label: string }[] = [
  { value: "income", label: "收租 · 有限收益换胜率" },
  { value: "directional", label: "方向 · 无限盈利可能" },
  { value: "hedge", label: "保护 · 给持仓上保险" },
  { value: "defined-risk", label: "结构 · 精确定点" },
  { value: "risk-any", label: "不确定 · 忽略" },
];

const DEFAULT_QUERY: ScenarioQuery = {
  direction: "neutral",
  vol: "vol-any",
  time: "time-any",
  risk: "risk-any",
};

// Short labels for the human sentence + breadcrumb.
const DIR_TEXT: Record<ScenarioQuery["direction"], string> = {
  "strong-bull": "强烈看涨",
  "mild-bull": "温和看涨",
  neutral: "中性震荡",
  "mild-bear": "温和看跌",
  "strong-bear": "强烈看跌",
};
const VOL_TEXT: Record<ScenarioQuery["vol"], string> = {
  "vol-up": "IV 会涨",
  "vol-flat": "IV 稳定",
  "vol-down": "IV 会崩",
  "vol-any": "波动率不限",
};
const TIME_TEXT: Record<ScenarioQuery["time"], string> = {
  "near-term": "短期",
  "mid-term": "中期",
  "long-term": "长期",
  "time-any": "时间不限",
};
const RISK_TEXT: Record<ScenarioQuery["risk"], string> = {
  income: "收租",
  directional: "赌方向",
  hedge: "上保险",
  "defined-risk": "定点结构",
  "risk-any": "方式不限",
};

const BIAS_LABEL: Record<StrategyDef["bias"], { label: string; color: string }> = {
  bull: { label: "看涨", color: "var(--greek-delta)" },
  bear: { label: "看跌", color: "var(--pnl-negative)" },
  neutral: { label: "中性", color: "var(--greek-rho)" },
  "bull-mild": { label: "温和看涨", color: "var(--greek-delta)" },
  "bear-mild": { label: "温和看跌", color: "var(--greek-theta)" },
  "high-vol": { label: "赌大波动", color: "var(--greek-vega)" },
  "low-vol": { label: "赌不动", color: "var(--greek-theta)" },
};

const CAT_LABEL: Record<StrategyDef["category"], string> = {
  "single-leg": "单腿",
  "single-leg-covered": "单腿+标的",
  synthetic: "合成",
  vertical: "垂直价差",
  "straddle-strangle": "跨式",
  butterfly: "蝶式",
  condor: "鹰式",
  "time-spread": "时间价差",
  collar: "领口",
  ratio: "比率",
  exotic: "结构化",
};

// base64(JSON) of legs — same scheme the Builder decodes from ?legs=.
function encodeLegs(legs: Leg[]): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(legs))));
  } catch {
    return "";
  }
}

// Mini payoff shape — identical treatment to the strategy-hub cards.
function MiniPayoff({ def }: { def: StrategyDef }) {
  const W = 200;
  const H = 76;
  const pad = 6;
  const points = useMemo(() => {
    const strikes = def.legs.map((l) => l.K).filter((k): k is number => k !== undefined);
    const k = strikes.length ? strikes.reduce((a, b) => a + b, 0) / strikes.length : 100;
    const lo = Math.max(1, k * 0.5);
    const hi = k * 1.5;
    const entry = entryCost(def.legs, REF.S0, REF.T, REF.r, REF.sigma);
    const n = 60;
    const ys: number[] = [];
    const raw: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const s = lo + ((hi - lo) * i) / n;
      const y = payoffAtExpiry(s, def.legs, entry, REF.r, REF.sigma);
      ys.push(y);
      raw.push({ x: i / n, y });
    }
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = maxY - minY || 1;
    return raw.map((p) => ({
      px: pad + p.x * (W - 2 * pad),
      py: pad + (1 - (p.y - minY) / span) * (H - 2 * pad),
    }));
  }, [def.legs]);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[76px] w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// A single option chip.
function Chip({
  active,
  label,
  onClick,
  testid,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={
        "rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors hover-elevate " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground")
      }
    >
      {label}
    </button>
  );
}

function QuestionGroup({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-primary">{step}</span>
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

// Small decorative breadcrumb: 方向 → 波动率 → 时间 → 风险 → 推荐.
function DecisionTree({ query }: { query: ScenarioQuery }) {
  const steps = [
    { label: "方向", value: DIR_TEXT[query.direction] },
    { label: "波动率", value: VOL_TEXT[query.vol] },
    { label: "时间", value: TIME_TEXT[query.time] },
    { label: "风险", value: RISK_TEXT[query.risk] },
    { label: "推荐策略", value: "→ 匹配" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="decision-tree">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
            <div className="font-mono text-[9px] text-muted-foreground/70">{s.label}</div>
            <div className="text-[11px] font-medium text-foreground">{s.value}</div>
          </div>
          {i < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
        </div>
      ))}
    </div>
  );
}

function RecommendationCard({
  def,
  score,
  reasons,
}: {
  def: StrategyDef;
  score: number;
  reasons: string[];
}) {
  const bias = BIAS_LABEL[def.bias];
  const legsParam = encodeLegs(def.legs);
  return (
    <Card className="border-border bg-card p-4" data-testid={`rec-${def.slug}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_1fr_1.3fr]">
        {/* Left — identity */}
        <div>
          <h3 className="text-sm font-semibold">{def.nameZh}</h3>
          <p className="font-mono text-[11px] text-muted-foreground/70">{def.nameEn}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
              style={{ borderColor: `hsl(${bias.color} / 0.4)`, color: `hsl(${bias.color})` }}
            >
              {bias.label}
            </span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {CAT_LABEL[def.category]}
            </span>
          </div>
        </div>

        {/* Middle — mini payoff */}
        <div className="flex items-center">
          <div className="w-full rounded-md border border-border bg-muted/20 p-1">
            <MiniPayoff def={def} />
          </div>
        </div>

        {/* Right — score + reasons */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">匹配度</span>
            <span className="font-mono text-xs font-semibold text-primary" data-testid={`score-${def.slug}`}>
              {score}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
          </div>
          <ul className="mt-2.5 space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer links */}
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3">
        <Link
          href={`/strategies/${def.slug}`}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          data-testid={`link-detail-${def.slug}`}
        >
          查看策略详情 <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/builder/legs/${legsParam}`}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          data-testid={`link-builder-${def.slug}`}
        >
          在编辑器打开 <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}

export default function Scenarios() {
  const [query, setQuery] = useState<ScenarioQuery>(DEFAULT_QUERY);
  const results = useMemo(() => scoreStrategies(query), [query]);
  const isDefault =
    query.direction === DEFAULT_QUERY.direction &&
    query.vol === DEFAULT_QUERY.vol &&
    query.time === DEFAULT_QUERY.time &&
    query.risk === DEFAULT_QUERY.risk;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Compass className="h-3.5 w-3.5" /> Phase 5 · Scenario Navigator
      </div>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="scenarios-title">
        市场情景导航
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        回答四个问题，给你 3-6 个匹配的策略。这是从「Greeks 直觉」走到「具体挑哪张牌」之间的那一层桥。
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-5">
        {/* ── Left: wizard (~40%) ── */}
        <div className="md:col-span-2">
          <div className="space-y-5 md:sticky md:top-6">
            <QuestionGroup step="Q1" title="方向观点">
              {Q1.map((o) => (
                <Chip
                  key={o.value}
                  active={query.direction === o.value}
                  label={o.label}
                  onClick={() => setQuery((q) => ({ ...q, direction: o.value }))}
                  testid={`q1-${o.value}`}
                />
              ))}
            </QuestionGroup>

            <QuestionGroup step="Q2" title="波动率预期">
              {Q2.map((o) => (
                <Chip
                  key={o.value}
                  active={query.vol === o.value}
                  label={o.label}
                  onClick={() => setQuery((q) => ({ ...q, vol: o.value }))}
                  testid={`q2-${o.value}`}
                />
              ))}
            </QuestionGroup>

            <QuestionGroup step="Q3" title="时间视野">
              {Q3.map((o) => (
                <Chip
                  key={o.value}
                  active={query.time === o.value}
                  label={o.label}
                  onClick={() => setQuery((q) => ({ ...q, time: o.value }))}
                  testid={`q3-${o.value}`}
                />
              ))}
            </QuestionGroup>

            <QuestionGroup step="Q4" title="风险偏好">
              {Q4.map((o) => (
                <Chip
                  key={o.value}
                  active={query.risk === o.value}
                  label={o.label}
                  onClick={() => setQuery((q) => ({ ...q, risk: o.value }))}
                  testid={`q4-${o.value}`}
                />
              ))}
            </QuestionGroup>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border"
              onClick={() => setQuery(DEFAULT_QUERY)}
              disabled={isDefault}
              data-testid="button-reset"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 重置
            </Button>
          </div>
        </div>

        {/* ── Right: live recommendations (~60%) ── */}
        <div className="md:col-span-3">
          {/* Human sentence */}
          <p className="text-[15px] leading-relaxed text-foreground" data-testid="query-sentence">
            你想在 <strong className="text-primary">{DIR_TEXT[query.direction]}</strong> 的情形下，
            <strong className="text-greek-vega">{VOL_TEXT[query.vol]}</strong>、
            <strong className="text-greek-gamma">{TIME_TEXT[query.time]}</strong>、以{" "}
            <strong className="text-greek-theta">{RISK_TEXT[query.risk]}</strong> 的方式操作。
          </p>

          {/* Decision breadcrumb */}
          <div className="mt-4">
            <DecisionTree query={query} />
          </div>

          {/* Recommendations */}
          <div className="mt-6">
            <div className="mb-3 font-mono text-[11px] text-muted-foreground/70" data-testid="rec-count">
              {results.length} 个匹配策略 · 按贴合度排序
            </div>
            {results.length === 0 ? (
              <div
                className="rounded-lg border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground"
                data-testid="empty-recs"
              >
                没有完美匹配 —— 试试放宽某些条件（比如把「波动率预期」或「风险偏好」调回「忽略」）。
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((r) => {
                  const def = STRATEGIES[r.slug];
                  if (!def) return null;
                  return (
                    <RecommendationCard key={r.slug} def={def} score={r.score} reasons={r.reasons} />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
