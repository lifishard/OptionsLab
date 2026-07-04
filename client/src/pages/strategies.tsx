import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { STRATEGIES, STRATEGY_ORDER, type StrategyDef } from "@/lib/strategies/definitions";
import { payoffAtExpiry, entryCost } from "@/lib/strategies/payoff";

const REF = { S0: 100, T: 30 / 365, r: 0.045, sigma: 0.3 };

// filter chips -> predicate over bias
const FILTERS: { key: string; label: string; test: (d: StrategyDef) => boolean }[] = [
  { key: "all", label: "全部", test: () => true },
  { key: "bull", label: "看涨", test: (d) => d.bias === "bull" || d.bias === "bull-mild" },
  { key: "bear", label: "看跌", test: (d) => d.bias === "bear" || d.bias === "bear-mild" },
  { key: "neutral", label: "中性", test: (d) => d.bias === "neutral" },
  {
    key: "income",
    label: "收租",
    test: (d) => d.greekSignature.theta === "+" && d.category !== "synthetic",
  },
];

const BIAS_LABEL: Record<StrategyDef["bias"], { label: string; color: string }> = {
  bull: { label: "看涨", color: "var(--greek-delta)" },
  bear: { label: "看跌", color: "var(--pnl-negative)" },
  neutral: { label: "中性", color: "var(--greek-rho)" },
  "bull-mild": { label: "温和看涨", color: "var(--greek-delta)" },
  "bear-mild": { label: "温和看跌", color: "var(--greek-theta)" },
};

const GREEK_COLORS = {
  delta: "var(--greek-delta)",
  gamma: "var(--greek-gamma)",
  theta: "var(--greek-theta)",
  vega: "var(--greek-vega)",
} as const;

// Small unlabeled payoff shape (SVG polyline) at expiry.
function MiniPayoff({ def }: { def: StrategyDef }) {
  const W = 220;
  const H = 100;
  const pad = 8;
  const points = useMemo(() => {
    const k = def.legs.find((l) => l.K !== undefined)?.K ?? 100;
    const lo = k * 0.6;
    const hi = k * 1.4;
    const entry = entryCost(def.legs, REF.S0, REF.T, REF.r, REF.sigma);
    const n = 60;
    const ys: number[] = [];
    const raw: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const s = lo + ((hi - lo) * i) / n;
      const y = payoffAtExpiry(s, def.legs, entry);
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
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[100px] w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function GreekPills({ def }: { def: StrategyDef }) {
  const items = [
    { g: "Δ", s: def.greekSignature.delta, c: GREEK_COLORS.delta },
    { g: "Γ", s: def.greekSignature.gamma, c: GREEK_COLORS.gamma },
    { g: "Θ", s: def.greekSignature.theta, c: GREEK_COLORS.theta },
    { g: "ν", s: def.greekSignature.vega, c: GREEK_COLORS.vega },
  ];
  return (
    <div className="flex gap-1.5">
      {items.map((it) => (
        <span
          key={it.g}
          className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
          style={{ borderColor: `hsl(${it.c} / 0.4)`, color: `hsl(${it.c})` }}
        >
          {it.g}
          {it.s}
        </span>
      ))}
    </div>
  );
}

export default function Strategies() {
  const [filter, setFilter] = useState("all");
  const active = FILTERS.find((f) => f.key === filter)!;
  const list = STRATEGY_ORDER.map((s) => STRATEGIES[s]).filter(active.test);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Header */}
      <Badge variant="outline" className="border-border font-mono text-[10px] text-primary">
        Phase 3a
      </Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        策略库 <span className="font-mono text-lg font-normal text-muted-foreground">· Single-Leg</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        从单腿开始 —— 每一张合约都是一次「性格」的选择。看涨还是看跌、收租还是买保险，先把 8 张最基础的牌摸熟，再谈组合。
      </p>

      {/* Filter chips */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            data-testid={`filter-${f.key}`}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover-elevate " +
              (filter === f.key ? "border-primary text-primary" : "border-border text-muted-foreground")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((def) => {
          const bias = BIAS_LABEL[def.bias];
          return (
            <Link key={def.slug} href={`/strategies/${def.slug}`}>
              <Card
                className="group h-full cursor-pointer border-border bg-card p-5 transition-colors hover-elevate"
                data-testid={`card-strategy-${def.slug}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{def.nameZh}</h3>
                    <p className="font-mono text-[11px] text-muted-foreground/70">{def.nameEn}</p>
                  </div>
                  {def.category === "synthetic" && (
                    <Badge variant="outline" className="shrink-0 border-border font-mono text-[9px] text-greek-vega">
                      桥梁
                    </Badge>
                  )}
                </div>

                <div className="my-3 rounded-md border border-border bg-muted/20 p-1">
                  <MiniPayoff def={def} />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <GreekPills def={def} />
                  <span
                    className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]"
                    style={{ borderColor: `hsl(${bias.color} / 0.4)`, color: `hsl(${bias.color})` }}
                  >
                    {bias.label}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  查看详情 <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Next-phase banner */}
      <div className="mt-10 rounded-lg border border-dashed border-border bg-muted/20 px-5 py-4">
        <div className="font-mono text-[10px] text-muted-foreground/70">下一步 · Next</div>
        <div className="mt-1 text-sm font-semibold">
          Phase 3b · 组合策略
          <span className="ml-2 font-normal text-muted-foreground">垂直价差、跨式、蝶式…</span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          摸熟单腿之后，把两三张合约拼起来 —— 用「合成多头」当桥，走进组合的世界。
        </p>
      </div>
    </div>
  );
}
