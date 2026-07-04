import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import type { StrategyDef } from "@/lib/strategies/definitions";
import { payoffAtExpiry, payoffNow, entryCost, aggregateGreeks } from "@/lib/strategies/payoff";

const R = 0.045; // risk-free rate, fixed reference

// bias label + color
const BIAS: Record<StrategyDef["bias"], { label: string; color: string }> = {
  bull: { label: "看涨", color: "var(--greek-delta)" },
  bear: { label: "看跌", color: "var(--pnl-negative)" },
  neutral: { label: "中性", color: "var(--greek-rho)" },
  "bull-mild": { label: "温和看涨 · 收租", color: "var(--greek-delta)" },
  "bear-mild": { label: "温和看跌 · 收租", color: "var(--greek-theta)" },
};

const CAT: Record<StrategyDef["category"], string> = {
  "single-leg": "单腿 · Single-Leg",
  "single-leg-covered": "单腿 + 标的",
  synthetic: "合成 · 桥梁策略",
};

// Greek signature pills — sign glyph + color from --greek-*
const GREEK_PILLS = [
  { key: "delta", glyph: "Δ", color: "var(--greek-delta)" },
  { key: "gamma", glyph: "Γ", color: "var(--greek-gamma)" },
  { key: "theta", glyph: "Θ", color: "var(--greek-theta)" },
  { key: "vega", glyph: "ν", color: "var(--greek-vega)" },
] as const;

function fmt(n: number, d = 2): string {
  if (!isFinite(n)) return "∞";
  return n.toFixed(d);
}

export function StrategyPage({ def }: { def: StrategyDef }) {
  const hasStrike = def.legs.some((l) => l.type !== "stock");
  const initialK = def.legs.find((l) => l.K !== undefined)?.K ?? 100;

  const [S, setS] = useState(100);
  const [K, setK] = useState(initialK);
  const [dte, setDte] = useState(30);
  const [ivPct, setIvPct] = useState(30);

  const sigma = ivPct / 100;
  const T = dte / 365;

  // Re-map legs so any option leg uses the slider K (shift preserved for multi-strike).
  const legs = useMemo(() => {
    return def.legs.map((l) => {
      if (l.K === undefined) return { ...l };
      const shift = l.K - initialK;
      return { ...l, K: K + shift };
    });
  }, [def.legs, K, initialK]);

  const entry = useMemo(() => entryCost(legs, S, T, R, sigma), [legs, S, T, sigma]);

  // Payoff curve across a ±40% band around K.
  const { data, breakevens, minY, maxY } = useMemo(() => {
    const lo = Math.max(1, K * 0.6);
    const hi = K * 1.4;
    const steps = 90;
    const rows: { s: number; exp: number; now: number; pos: number; neg: number }[] = [];
    const bes: number[] = [];
    let prevExp = payoffAtExpiry(lo, legs, entry);
    for (let i = 0; i <= steps; i++) {
      const s = lo + ((hi - lo) * i) / steps;
      const exp = payoffAtExpiry(s, legs, entry);
      const now = payoffNow(s, legs, T, R, sigma, entry);
      rows.push({
        s,
        exp,
        now,
        pos: Math.max(exp, 0),
        neg: Math.min(exp, 0),
      });
      if (i > 0 && prevExp * exp < 0) {
        // linear interp breakeven
        const s0 = lo + ((hi - lo) * (i - 1)) / steps;
        const be = s0 + ((s - s0) * (0 - prevExp)) / (exp - prevExp);
        bes.push(be);
      }
      prevExp = exp;
    }
    const ys = rows.flatMap((r) => [r.exp, r.now]);
    return {
      data: rows,
      breakevens: bes,
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [legs, entry, T, sigma, K]);

  // Aggregate Greeks at current S — normalized for radar (abs, scaled per-greek).
  const greeks = useMemo(() => aggregateGreeks(S, legs, T, R, sigma), [S, legs, T, sigma]);
  const radarData = useMemo(() => {
    // Per-greek scale so all fit 0..1 on the same radar.
    const scale = { delta: 1, gamma: 20, theta: 20, vega: 5, rho: 5 } as const;
    return [
      { g: "Δ", v: Math.min(Math.abs(greeks.delta) * scale.delta, 1), full: 1 },
      { g: "Γ", v: Math.min(Math.abs(greeks.gamma) * scale.gamma, 1), full: 1 },
      { g: "Θ", v: Math.min(Math.abs(greeks.theta) * scale.theta, 1), full: 1 },
      { g: "ν", v: Math.min(Math.abs(greeks.vega) * scale.vega, 1), full: 1 },
      { g: "Ρ", v: Math.min(Math.abs(greeks.rho) * scale.rho, 1), full: 1 },
    ];
  }, [greeks]);

  const bias = BIAS[def.bias];
  const kpis = [
    { label: "最大盈利", value: def.riskProfile.maxProfit, color: "var(--pnl-positive)" },
    { label: "最大亏损", value: def.riskProfile.maxLoss, color: "var(--pnl-negative)" },
    { label: "盈亏平衡", value: def.riskProfile.breakeven, color: "var(--greek-rho)" },
    {
      label: "净成本 / 权利金 (per share)",
      value: (entry >= 0 ? "净支出 " : "净收入 ") + fmt(Math.abs(entry)),
      color: entry >= 0 ? "var(--greek-theta)" : "var(--primary)",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-border font-mono text-[10px] text-muted-foreground">
          {CAT[def.category]}
        </Badge>
        <Badge
          variant="outline"
          className="border-border font-mono text-[10px]"
          style={{ color: `hsl(${bias.color})` }}
        >
          {bias.label}
        </Badge>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="strategy-title">
        {def.nameZh}
        <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">· {def.nameEn}</span>
      </h1>

      {/* Greek signature row */}
      <div className="mt-3 flex flex-wrap gap-2">
        {GREEK_PILLS.map((p) => {
          const s = def.greekSignature[p.key];
          return (
            <span
              key={p.key}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs"
              style={{ borderColor: `hsl(${p.color} / 0.4)`, color: `hsl(${p.color})` }}
              data-testid={`pill-${p.key}`}
            >
              {p.glyph} {s}
            </span>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left column: copy */}
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">直觉 · Intuition</h2>
            <p className="text-[15px] leading-relaxed text-slate-300">{def.intuition}</p>
          </div>

          <div className="border-l-4 border-cyan-500 bg-cyan-500/5 py-2 pl-4">
            <h3 className="mb-2 text-sm font-semibold text-cyan-300">适用场景</h3>
            <ul className="space-y-1.5 text-[13px] leading-relaxed text-slate-300">
              {def.whenToUse.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 text-cyan-500">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-l-4 border-red-500 bg-red-500/5 py-2 pl-4">
            <h3 className="mb-2 text-sm font-semibold text-red-300">风险</h3>
            <ul className="space-y-1.5 text-[13px] leading-relaxed text-slate-300">
              {def.risks.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 text-red-500">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-l-4 border-amber-500 bg-amber-500/5 py-2 pl-4">
            <h3 className="mb-2 text-sm font-semibold text-amber-300">调整口径</h3>
            <ul className="space-y-1.5 text-[13px] leading-relaxed text-slate-300">
              {def.adjustments.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 text-amber-500">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right column: interactive */}
        <div className="space-y-4">
          {/* Sliders */}
          <Card className="border-border bg-card p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <SliderRow label="当前股价 S" value={S} unit="" min={40} max={160} step={1} onChange={setS} testid="slider-s" />
              <SliderRow
                label="行权价 K"
                value={K}
                unit=""
                min={60}
                max={140}
                step={1}
                onChange={setK}
                disabled={!hasStrike}
                testid="slider-k"
              />
              <SliderRow label="剩余天数 DTE" value={dte} unit="天" min={1} max={180} step={1} onChange={setDte} testid="slider-dte" />
              <SliderRow label="隐含波动率 σ" value={ivPct} unit="%" min={5} max={120} step={1} onChange={setIvPct} testid="slider-iv" />
            </div>
          </Card>

          {/* Payoff chart */}
          <Card className="border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">损益图 (per share)</span>
              <span className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-0.5 w-4 bg-primary" /> 到期
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" /> 当前
                </span>
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                  <XAxis
                    dataKey="s"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    tickFormatter={(v) => fmt(v, 0)}
                    stroke="hsl(var(--border))"
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    width={44}
                    domain={[minY, maxY]}
                    tickFormatter={(v) => fmt(Number(v), 0)}
                    allowDecimals={false}
                    stroke="hsl(var(--border))"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                    }}
                    labelFormatter={(v) => `S = ${fmt(Number(v), 1)}`}
                    formatter={(val: number, name) => [fmt(val), name === "exp" ? "到期" : name === "now" ? "当前" : ""]}
                  />
                  <Area dataKey="pos" fill="hsl(var(--pnl-positive))" fillOpacity={0.12} stroke="none" isAnimationActive={false} />
                  <Area dataKey="neg" fill="hsl(var(--pnl-negative))" fillOpacity={0.12} stroke="none" isAnimationActive={false} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                  <Line dataKey="now" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line dataKey="exp" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {breakevens.map((be, i) => (
                    <ReferenceDot key={i} x={be} y={0} r={4} fill="hsl(var(--greek-rho))" stroke="hsl(var(--background))" strokeWidth={2} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {breakevens.length > 0 && (
              <div className="mt-1 font-mono text-[10px]" style={{ color: "hsl(var(--greek-rho))" }}>
                盈亏平衡 · BE = {breakevens.map((b) => fmt(b, 1)).join(" , ")}
              </div>
            )}
          </Card>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((k) => (
              <Card key={k.label} className="border-border bg-card p-3" data-testid={`kpi-${k.label}`}>
                <div className="text-[10px] text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-[13px] font-semibold leading-snug" style={{ color: `hsl(${k.color})` }}>
                  {k.value}
                </div>
              </Card>
            ))}
          </div>

          {/* Greek radar */}
          <Card className="border-border bg-card p-4">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              当前聚合 Greeks（绝对值 · 归一化）
            </div>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
              <span style={{ color: "hsl(var(--greek-delta))" }}>Δ {fmt(greeks.delta, 3)}</span>
              <span style={{ color: "hsl(var(--greek-gamma))" }}>Γ {fmt(greeks.gamma, 4)}</span>
              <span style={{ color: "hsl(var(--greek-theta))" }}>Θ {fmt(greeks.theta, 4)}</span>
              <span style={{ color: "hsl(var(--greek-vega))" }}>ν {fmt(greeks.vega, 4)}</span>
              <span style={{ color: "hsl(var(--greek-rho))" }}>Ρ {fmt(greeks.rho, 4)}</span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="g"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontFamily: "var(--font-mono)" }}
                  />
                  <Radar dataKey="v" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} isAnimationActive={false} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  disabled,
  testid,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  testid: string;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="font-mono text-xs text-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        className="mt-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        data-testid={testid}
      />
    </div>
  );
}
