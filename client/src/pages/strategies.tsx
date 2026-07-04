import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { STRATEGIES, STRATEGY_ORDER, type StrategyDef } from "@/lib/strategies/definitions";
import { payoffAtExpiry, entryCost } from "@/lib/strategies/payoff";

const REF = { S0: 100, T: 30 / 365, r: 0.045, sigma: 0.3 };

// Filter chips — category-driven (with a couple of bias-based shortcuts).
const FILTERS: { key: string; label: string; test: (d: StrategyDef) => boolean }[] = [
  { key: "all", label: "全部", test: () => true },
  { key: "single", label: "单腿", test: (d) => d.category === "single-leg" || d.category === "single-leg-covered" || d.category === "synthetic" },
  { key: "vertical", label: "垂直", test: (d) => d.category === "vertical" },
  { key: "straddle", label: "跨式", test: (d) => d.category === "straddle-strangle" },
  { key: "flywing", label: "蝶鹰", test: (d) => d.category === "butterfly" || d.category === "condor" },
  { key: "time", label: "时间", test: (d) => d.category === "time-spread" },
  { key: "collar", label: "领口", test: (d) => d.category === "collar" },
  { key: "ratio", label: "比率", test: (d) => d.category === "ratio" || d.category === "exotic" },
  { key: "high-vol", label: "高波动", test: (d) => d.bias === "high-vol" },
  { key: "low-vol", label: "低波动", test: (d) => d.bias === "low-vol" },
];

// Category display order + subheader labels used when showing 全部.
const CAT_GROUPS: { key: StrategyDef["category"]; label: string; en: string }[] = [
  { key: "single-leg", label: "单腿基础", en: "Single-Leg" },
  { key: "single-leg-covered", label: "单腿 + 标的", en: "Covered" },
  { key: "synthetic", label: "合成 · 桥梁", en: "Synthetic" },
  { key: "vertical", label: "垂直价差", en: "Vertical Spreads" },
  { key: "straddle-strangle", label: "跨式 / 宽跨", en: "Straddle / Strangle" },
  { key: "butterfly", label: "蝶式", en: "Butterfly" },
  { key: "condor", label: "鹰式", en: "Condor" },
  { key: "time-spread", label: "时间价差", en: "Calendar / Diagonal" },
  { key: "collar", label: "领口", en: "Collar" },
  { key: "ratio", label: "比率价差", en: "Ratio" },
  { key: "exotic", label: "高级 / 结构化", en: "Exotic" },
];

const BIAS_LABEL: Record<StrategyDef["bias"], { label: string; color: string }> = {
  bull: { label: "看涨", color: "var(--greek-delta)" },
  bear: { label: "看跌", color: "var(--pnl-negative)" },
  neutral: { label: "中性", color: "var(--greek-rho)" },
  "bull-mild": { label: "温和看涨", color: "var(--greek-delta)" },
  "bear-mild": { label: "温和看跌", color: "var(--greek-theta)" },
  "high-vol": { label: "赌大波动", color: "var(--greek-vega)" },
  "low-vol": { label: "赌不动", color: "var(--greek-theta)" },
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

function StrategyCard({ def }: { def: StrategyDef }) {
  const bias = BIAS_LABEL[def.bias];
  const isBridge = def.category === "synthetic";
  return (
    <Link href={`/strategies/${def.slug}`}>
      <Card
        className="group h-full cursor-pointer border-border bg-card p-5 transition-colors hover-elevate"
        data-testid={`card-strategy-${def.slug}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{def.nameZh}</h3>
            <p className="font-mono text-[11px] text-muted-foreground/70">{def.nameEn}</p>
          </div>
          {isBridge && (
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
}

export default function Strategies() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const all = useMemo(() => STRATEGY_ORDER.map((s) => STRATEGIES[s]).filter(Boolean), []);
  const active = FILTERS.find((f) => f.key === filter)!;

  const q = query.trim().toLowerCase();
  const matchesQuery = (d: StrategyDef) =>
    !q || d.nameZh.toLowerCase().includes(q) || d.nameEn.toLowerCase().includes(q);

  const filtered = all.filter((d) => active.test(d) && matchesQuery(d));

  // Grouped view only when showing 全部 with no search — otherwise flat grid.
  const grouped = filter === "all" && !q;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Header */}
      <Badge variant="outline" className="border-border font-mono text-[10px] text-primary">
        Phase 3a + 3b
      </Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        策略库 <span className="font-mono text-lg font-normal text-muted-foreground">· 32 个策略</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        8 张单腿基础牌 + 24 个组合 —— 价差、跨式、蝶鹰、日历、领口、比率、结构化。每张卡片都是一次「性格」的选择：看涨看跌、收租还是买保险、赌波动还是收波动。先摸熟单腿，再走进组合。
      </p>

      {/* Search */}
      <div className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 sm:max-w-xs">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索策略名 · 中/英"
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          data-testid="input-search"
        />
      </div>

      {/* Filter chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = all.filter((d) => f.test(d)).length;
          return (
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
              <span className="ml-1 font-mono text-[10px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Result count */}
      <div className="mt-4 font-mono text-[11px] text-muted-foreground/70" data-testid="text-result-count">
        {filtered.length} 个策略
      </div>

      {/* Grid — grouped or flat */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground" data-testid="empty-strategies">
          没有匹配的策略。换个筛选条件或清空搜索试试。
        </div>
      ) : grouped ? (
        <div className="mt-6 space-y-10">
          {CAT_GROUPS.map((group) => {
            const items = all.filter((d) => d.category === group.key);
            if (!items.length) return null;
            return (
              <section key={group.key} data-testid={`group-${group.key}`}>
                <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-2">
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <span className="font-mono text-[11px] text-muted-foreground/60">
                    {group.en} · {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((def) => (
                    <StrategyCard key={def.slug} def={def} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((def) => (
            <StrategyCard key={def.slug} def={def} />
          ))}
        </div>
      )}

      {/* Next-phase banner -> Position Builder */}
      <Link href="/builder">
        <div
          className="mt-12 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-dashed border-border bg-muted/20 px-5 py-4 transition-colors hover-elevate"
          data-testid="banner-builder"
        >
          <div>
            <div className="font-mono text-[10px] text-muted-foreground/70">下一步 · Phase 4</div>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-greek-gamma" />
              组合编辑器 · Position Builder
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              把这些策略当积木 —— 自由拼多腿仓位，实时看损益图、盈亏平衡、聚合 Greeks 和敏感度热力图。任一策略都能一键载入。
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-primary" />
        </div>
      </Link>
    </div>
  );
}
