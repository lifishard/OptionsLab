import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { bsmPrice, OptionType } from "@/lib/options/bsm";
import { delta, gamma, theta, vega, rho } from "@/lib/options/greeks";
import { STEPS, LAOOU_ATTRIBUTION, LAOOU_LINK } from "./walkthrough-content";
import { ChevronRight } from "lucide-react";

const POINTS = 160;

function fmt(n: number, digits = 3): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function yTickFormatter(v: number): string {
  if (!isFinite(v)) return "";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1000) return (v / 1000).toFixed(1) + "k";
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.1) return v.toFixed(3);
  if (a >= 0.01) return v.toFixed(3);
  if (a >= 0.001) return v.toFixed(4);
  return v.toExponential(1);
}

interface Params {
  S: number;
  K: number;
  days: number;
  iv: number; // decimal
  r: number; // decimal
  type: OptionType;
}

function gi(S: number, p: Params, type: OptionType) {
  return { S, K: p.K, T: p.days / 365, r: p.r, sigma: p.iv, q: 0, type };
}

// The Greek plotted (vs S) on each of the middle steps.
const GREEK_FN: Record<
  string,
  { label: string; fn: (S: number, p: Params, t: OptionType) => number }
> = {
  delta: { label: "Delta", fn: (S, p, t) => delta(gi(S, p, t)) },
  gamma: { label: "Gamma", fn: (S, p, t) => gamma(gi(S, p, t)) },
  theta: { label: "Theta / day", fn: (S, p, t) => theta(gi(S, p, t), true) },
  vega: { label: "Vega / 1%", fn: (S, p, t) => vega(gi(S, p, t)) },
  rho: { label: "Rho / 1%", fn: (S, p, t) => rho(gi(S, p, t)) },
};

type ChartType = "call" | "put" | "compare";

const PUT_HUE = "24 90% 58%"; // contrasting orange for Put lines in Compare mode

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-lg">
      <div className="font-mono text-[11px] text-muted-foreground">
        S = {fmt(Number(label), 2)}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="font-mono text-xs" style={{ color: p.stroke }}>
          {p.name}: {fmt(p.value, 4)}
        </div>
      ))}
    </div>
  );
}

function SliderRow({
  label,
  sub,
  value,
  min,
  max,
  step,
  onChange,
  format,
  color,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  color?: string;
}) {
  const testid = label.toLowerCase().replace(/[^a-z]/g, "");
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">
          {label} <span className="font-mono text-[10px] text-muted-foreground/60">{sub}</span>
        </Label>
        <span
          className="font-mono text-xs tabular"
          style={color ? { color: `hsl(${color})` } : undefined}
          data-testid={`value-slider-${testid}`}
        >
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        data-testid={`slider-${testid}`}
      />
    </div>
  );
}

// ---------- Shared term primer ----------------------------------------------
// Small reusable strip that reminds readers what each symbol/letter means.
// Rendered at the top of every step so users who jump around never have to
// scroll back to find a definition.

interface GlossaryItem {
  symbol: string;
  desc: string;
}

function GlossaryStrip({
  title,
  items,
  testid,
}: {
  title: string;
  items: GlossaryItem[];
  testid?: string;
}) {
  return (
    <div
      className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground"
      data-testid={testid}
    >
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-foreground/80">
        {title}
      </div>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {items.map((it, i) => (
          <div key={i}>
            <span className="font-mono text-foreground">{it.symbol}</span>
            <span className="mx-1">—</span>
            {it.desc}
          </div>
        ))}
      </div>
    </div>
  );
}

// Per-Greek term primers. Each row: symbol, plain-language definition.
// Shown at the top of the Greek step so beginners always know what letter
// stands for what — no more "what's ν? what's DTE?".
const GREEK_GLOSSARIES: Record<string, GlossaryItem[]> = {
  delta: [
    { symbol: "Δ (Delta)", desc: "S 每升 1 元，权利金变多少元" },
    { symbol: "S", desc: "标的现价" },
    { symbol: "K", desc: "行权价（合约里写死的价）" },
    { symbol: "范围", desc: "Call Δ ∈ [0, 1]；Put Δ ∈ [−1, 0]" },
  ],
  gamma: [
    { symbol: "Γ (Gamma)", desc: "S 每升 1 元，Δ 变多少（“Δ 的加速度”）" },
    { symbol: "S / K", desc: "标的现价 / 行权价" },
    { symbol: "峰值", desc: "S≈K（平值 ATM）时 Γ 最大，两头行权价 Γ 小" },
    { symbol: "相关", desc: "临近到期且 ATM 的合约 Γ 爆炸代表风险大" },
  ],
  theta: [
    { symbol: "Θ (Theta)", desc: "每过 1 天，权利金变化多少（买方通常为负）" },
    { symbol: "DTE", desc: "Days To Expiry — 剩余到期天数" },
    { symbol: "单位", desc: "每天 元 / 股（图上已年化 → 日化）" },
    { symbol: "相关", desc: "DTE 越少，|Θ| 越大；ATM 同 DTE 内 |Θ| 最大" },
  ],
  vega: [
    { symbol: "ν (Vega)", desc: "IV 每升 1 个百分点，权利金变多少元" },
    { symbol: "IV / σ", desc: "隐含波动率 Implied Volatility（年化%）" },
    { symbol: "S / K", desc: "标的现价 / 行权价" },
    { symbol: "相关", desc: "DTE 越长、越靠 ATM，ν 越大" },
  ],
  rho: [
    { symbol: "ρ (Rho)", desc: "无风险利率 r 每升 1 个百分点，权利金变多少" },
    { symbol: "r", desc: "无风险利率（国库/隔夜率，年化%）" },
    { symbol: "DTE", desc: "剩余到期天数；越长 ρ 影响越大" },
    { symbol: "方向", desc: "Call ρ > 0（利率涨，持仓成本上升）；Put ρ < 0" },
  ],
};

// ---------- Step 0: intuition side-by-side ----------
function IntroInteractive() {
  // Two hypothetical SPY contracts, S rises 100 -> 105 (+5%).
  const base = { T: 30 / 365, r: 0.045, sigma: 0.3, q: 0, type: "call" as OptionType };
  const contracts = [
    { name: "ATM · K=100", K: 100, tag: "平值：行权价 = 现价" },
    { name: "OTM · K=110", K: 110, tag: "虚值：行权价 > 现价" },
  ];
  return (
    <div className="space-y-4">
      <GlossaryStrip
        title="先约定几个符号"
        testid="intro-glossary"
        items={[
          { symbol: "S", desc: "标的现价（这里是 SPY 的股价）" },
          { symbol: "K", desc: "行权价（合约里写死的那个价）" },
          { symbol: "Call", desc: "看涨期权，赌 S 涨过 K" },
          { symbol: "ATM / OTM", desc: "平值 (S≈K) / 虚值 (S<K)" },
        ]}
      />

      <div className="text-xs text-muted-foreground">
        场景：SPY 现价 <span className="font-mono text-foreground">S=100</span>，30 天后一次涨到
        <span className="font-mono text-foreground"> S=105</span>（+5%）。
        我们拿两张同标的、同到期日的 Call 摆一起——
        一张行权价 <span className="font-mono text-foreground">K=100</span>（平值），
        一张行权价 <span className="font-mono text-foreground">K=110</span>（虚值 10%）。
        看两张的收益差多少。
      </div>
      <div className="grid grid-cols-2 gap-4">
        {contracts.map((c) => {
          const before = bsmPrice({ S: 100, K: c.K, ...base });
          const after = bsmPrice({ S: 105, K: c.K, ...base });
          const ret = ((after - before) / before) * 100;
          return (
            <div
              key={c.name}
              className="rounded-lg border border-border bg-muted/30 p-4"
              data-testid={`intro-contract-${c.K}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">{c.name}</div>
                <div className="text-[10px] text-muted-foreground/70">{c.tag}</div>
              </div>
              <div className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>权利金 (S=100)</span>
                  <span className="tabular text-foreground">{fmt(before, 2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>权利金 (S=105)</span>
                  <span className="tabular text-foreground">{fmt(after, 2)}</span>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  合约收益
                </div>
                <div
                  className="font-mono text-3xl font-semibold tabular"
                  style={{ color: "hsl(var(--pnl-positive))" }}
                >
                  +{fmt(ret, 0)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground">
        标的只涨 <span className="font-mono text-foreground">+5%</span>，但两张合约的收益天差地别——
        这就是为什么“选哪张合约”本身就是交易的一部分。
      </div>
    </div>
  );
}

// ---------- Step 6: synthesis presets + radar ----------
interface Preset {
  key: string;
  name: string;
  S: number;
  K: number;
  days: number;
  ivPct: number;
}
const PRESETS: Preset[] = [
  { key: "leaps", name: "LEAPS 实值 K=80 DTE=500", S: 100, K: 80, days: 500, ivPct: 30 },
  { key: "monthly", name: "月度 ATM K=100 DTE=30", S: 100, K: 100, days: 30, ivPct: 30 },
  { key: "weekly", name: "周度虚值 K=110 DTE=7", S: 100, K: 110, days: 7, ivPct: 30 },
];

function normAbs(v: number, max: number): number {
  const n = Math.abs(v) / max;
  return Math.min(1, n);
}

function SynthesisInteractive() {
  const [active, setActive] = useState(PRESETS[0].key);
  const preset = PRESETS.find((p) => p.key === active)!;
  const p: Params = {
    S: preset.S,
    K: preset.K,
    days: preset.days,
    iv: preset.ivPct / 100,
    r: 0.045,
    type: "call",
  };
  const g = gi(p.S, p, "call");
  const raw = {
    delta: delta(g),
    gamma: gamma(g),
    theta: theta(g, true),
    vega: vega(g),
    rho: rho(g),
  };
  // Normalize each Greek to 0–1 for a comparable radar shape.
  const radar = [
    { greek: "Delta", v: normAbs(raw.delta, 1) },
    { greek: "Gamma", v: normAbs(raw.gamma, 0.06) },
    { greek: "Theta", v: normAbs(raw.theta, 0.1) },
    { greek: "Vega", v: normAbs(raw.vega, 0.4) },
    { greek: "Rho", v: normAbs(raw.rho, 1.2) },
  ];
  const table = [
    { label: "Delta", value: raw.delta, digits: 3, color: "var(--greek-delta)" },
    { label: "Gamma", value: raw.gamma, digits: 4, color: "var(--greek-gamma)" },
    { label: "Theta/d", value: raw.theta, digits: 4, color: "var(--greek-theta)" },
    { label: "Vega/1%", value: raw.vega, digits: 4, color: "var(--greek-vega)" },
    { label: "Rho/1%", value: raw.rho, digits: 4, color: "var(--greek-rho)" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((pr) => (
          <Button
            key={pr.key}
            size="sm"
            variant={pr.key === active ? "default" : "outline"}
            className={pr.key === active ? "" : "border-border"}
            onClick={() => setActive(pr.key)}
            data-testid={`preset-${pr.key}`}
          >
            {pr.name}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
        <Card className="border-border bg-card p-4">
          <div className="mb-1 text-sm font-semibold">性格档案 · Greeks Radar</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="greek"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Radar
                  dataKey="v"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.35}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            当前值 · at S={fmt(p.S, 0)}
          </div>
          <div className="space-y-2">
            {table.map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{r.label}</span>
                <span
                  className="font-mono text-xs tabular"
                  style={{ color: `hsl(${r.color})` }}
                  data-testid={`synth-value-${r.label.toLowerCase().replace(/[^a-z]/g, "")}`}
                >
                  {fmt(r.value, r.digits)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Main interactive area for the 5 Greek steps ----------
function GreekChart({
  greekKey,
  color,
  params,
  chartType,
}: {
  greekKey: string;
  color: string;
  params: Params;
  chartType: ChartType;
}) {
  const meta = GREEK_FN[greekKey];
  const { series, sMin, sMax } = useMemo(() => {
    const lo = params.S * 0.6;
    const hi = params.S * 1.4;
    const dx = (hi - lo) / (POINTS - 1);
    const rows = Array.from({ length: POINTS }, (_, i) => {
      const s = lo + i * dx;
      return {
        s,
        call: meta.fn(s, params, "call"),
        put: meta.fn(s, params, "put"),
      };
    });
    return { series: rows, sMin: lo, sMax: hi };
  }, [params, meta]);

  const curCall = meta.fn(params.S, params, "call");
  const curPut = meta.fn(params.S, params, "put");
  const showCall = chartType === "call" || chartType === "compare";
  const showPut = chartType === "put" || chartType === "compare";

  return (
    <Card className="border-border bg-card p-4" data-testid={`chart-${greekKey}`}>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: `hsl(${color})` }}>
          {meta.label} vs 标的价 S
        </div>
        <div className="flex gap-3 font-mono text-xs">
          {showCall && (
            <span style={{ color: `hsl(${color})` }} data-testid={`cur-call-${greekKey}`}>
              Call {fmt(curCall, 4)}
            </span>
          )}
          {showPut && (
            <span style={{ color: `hsl(${PUT_HUE})` }} data-testid={`cur-put-${greekKey}`}>
              Put {fmt(curPut, 4)}
            </span>
          )}
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="s"
              type="number"
              domain={[sMin, sMax]}
              tickCount={6}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickFormatter={(v) => fmt(v, 0)}
              stroke="hsl(var(--border))"
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickFormatter={yTickFormatter}
              width={56}
              stroke="hsl(var(--border))"
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.3 }}
            />
            <ReferenceLine x={params.K} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" strokeOpacity={0.5} label={{ value: "K", fill: "hsl(var(--muted-foreground))", fontSize: 10, position: "top" }} />
            {showCall && (
              <Line
                name="Call"
                type="monotone"
                dataKey="call"
                stroke={`hsl(${color})`}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showPut && (
              <Line
                name="Put"
                type="monotone"
                dataKey="put"
                stroke={`hsl(${PUT_HUE})`}
                strokeWidth={2}
                strokeDasharray={chartType === "compare" ? "5 3" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showCall && (
              <ReferenceDot x={params.S} y={curCall} r={5} fill={`hsl(${color})`} stroke="hsl(var(--background))" strokeWidth={2} />
            )}
            {showPut && (
              <ReferenceDot x={params.S} y={curPut} r={5} fill={`hsl(${PUT_HUE})`} stroke="hsl(var(--background))" strokeWidth={2} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------- Step 4 extra: IV -> price chart ----------
function VegaIvChart({ params }: { params: Params }) {
  const series = useMemo(() => {
    const rows: { sigma: number; price: number }[] = [];
    for (let s = 5; s <= 100; s += 1) {
      rows.push({
        sigma: s,
        price: bsmPrice({ S: params.S, K: params.K, T: params.days / 365, r: params.r, sigma: s / 100, q: 0, type: "call" }),
      });
    }
    return rows;
  }, [params.S, params.K, params.days, params.r]);
  const curPrice = bsmPrice({ S: params.S, K: params.K, T: params.days / 365, r: params.r, sigma: params.iv, q: 0, type: "call" });
  const curSigma = params.iv * 100;
  return (
    <Card className="border-border bg-card p-4" data-testid="chart-vega-iv">
      <div className="mb-1 text-sm font-semibold" style={{ color: "hsl(var(--greek-vega))" }}>
        波动率变化对权利金的放大效应
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="sigma"
              type="number"
              domain={[5, 100]}
              tickCount={6}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickFormatter={(v) => `${v}%`}
              stroke="hsl(var(--border))"
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickFormatter={yTickFormatter}
              width={56}
              stroke="hsl(var(--border))"
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.3 }} />
            <Line
              name="权利金"
              type="monotone"
              dataKey="price"
              stroke="hsl(var(--greek-vega))"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceDot x={curSigma} y={curPrice} r={5} fill="hsl(var(--greek-vega))" stroke="hsl(var(--background))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function Greeks() {
  const [stepIdx, setStepIdx] = useState(0);
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [days, setDays] = useState(30);
  const [ivPct, setIvPct] = useState(30);
  const [rPct, setRPct] = useState(4.5);
  const [chartType, setChartType] = useState<ChartType>("call");

  const step = STEPS[stepIdx];
  const params: Params = useMemo(
    () => ({ S, K, days, iv: ivPct / 100, r: rPct / 100, type: "call" }),
    [S, K, days, ivPct, rPct],
  );

  const isGreekStep = ["delta", "gamma", "theta", "vega", "rho"].includes(step.id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Greeks Walkthrough · 老欧叙事版</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          跟着老欧走一遍七步——从选合约的直觉，到五个 Greeks，再到把它们合成一张合约的“性格档案”。
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const activeStep = i === stepIdx;
          return (
            <button
              key={s.id}
              onClick={() => setStepIdx(i)}
              data-testid={`step-pill-${i}`}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover-elevate " +
                (activeStep
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground")
              }
              style={activeStep && s.color ? { color: `hsl(${s.color})`, borderColor: `hsl(${s.color})` } : undefined}
            >
              <span className="font-mono text-[10px] opacity-60">{i}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      <Card className="border-border bg-card p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
          {/* Left: narrative */}
          <div className="space-y-4">
            <div>
              <h2
                className="text-lg font-semibold"
                style={step.color ? { color: `hsl(${step.color})` } : undefined}
              >
                {step.title}
              </h2>
            </div>

            <blockquote className="border-l-2 border-border pl-3 text-sm italic leading-relaxed text-slate-300">
              {step.intro.map((line, i) => (
                <p key={i} className={i > 0 ? "mt-1" : ""}>
                  {line}
                </p>
              ))}
            </blockquote>

            <Collapsible>
              <CollapsibleTrigger
                className="text-xs text-primary hover:underline"
                data-testid="trigger-full-text"
              >
                展开老欧完整原文 ▾
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1.5 rounded-md border border-border bg-muted/20 p-3 text-sm leading-relaxed text-slate-300">
                {step.full.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </CollapsibleContent>
            </Collapsible>

            {/* Closing quote */}
            <div className="border-l-4 border-yellow-500 bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-100">
              <span className="mr-1">✨</span>
              {step.quote}
            </div>

            <div className="text-xs text-slate-500">
              <a href={LAOOU_LINK} className="hover:underline" data-testid="link-laoou">
                {LAOOU_ATTRIBUTION}
              </a>
            </div>
          </div>

          {/* Right: interactive */}
          <div className="space-y-4">
            {step.id === "intro" && <IntroInteractive />}
            {step.id === "synthesis" && <SynthesisInteractive />}

            {isGreekStep && (
              <>
                {GREEK_GLOSSARIES[step.id] && (
                  <GlossaryStrip
                    title={`先约定几个符号 · ${step.label}`}
                    testid={`glossary-${step.id}`}
                    items={GREEK_GLOSSARIES[step.id]}
                  />
                )}

                {/* Type selector (Iter B) */}
                <div className="flex gap-2">
                  {(["call", "put", "compare"] as ChartType[]).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={chartType === t ? "default" : "outline"}
                      className={chartType === t ? "" : "border-border"}
                      onClick={() => setChartType(t)}
                      data-testid={`charttype-${t}`}
                    >
                      {t === "call" ? "Call" : t === "put" ? "Put" : "Compare"}
                    </Button>
                  ))}
                </div>

                <GreekChart greekKey={step.id} color={step.color} params={params} chartType={chartType} />

                {step.id === "vega" && <VegaIvChart params={params} />}

                {/* Step-relevant sliders */}
                <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                  {(step.id === "delta" || step.id === "gamma") && (
                    <SliderRow label="Underlying S" sub="现价" value={S} min={70} max={130} step={0.5} onChange={setS} color={step.color} />
                  )}
                  {(step.id === "delta" || step.id === "gamma") && (
                    <SliderRow label="Strike K" sub="行权价" value={K} min={70} max={130} step={0.5} onChange={setK} />
                  )}
                  {step.id === "theta" && (
                    <SliderRow label="Days to Expiry" sub="剩余天数 DTE" value={days} min={1} max={120} step={1} onChange={setDays} format={(v) => `${v} 天`} color={step.color} />
                  )}
                  {step.id === "vega" && (
                    <SliderRow label="IV sigma" sub="隐含波动率" value={ivPct} min={5} max={100} step={1} onChange={setIvPct} format={(v) => `${v}%`} color={step.color} />
                  )}
                  {step.id === "rho" && (
                    <>
                      <SliderRow label="Risk-free r" sub="无风险利率" value={rPct} min={0} max={8} step={0.1} onChange={setRPct} format={(v) => `${v}%`} color={step.color} />
                      <SliderRow label="Days to Expiry" sub="剩余天数 DTE" value={days} min={1} max={730} step={1} onChange={setDays} format={(v) => `${v} 天`} />
                    </>
                  )}
                </div>
              </>
            )}

            {/* Operation instruction card */}
            <div className="border-l-4 border-cyan-500 bg-slate-800/50 p-4 text-sm leading-relaxed text-slate-200" data-testid="instruction-card">
              <span className="mr-1">👉</span>
              {step.instruction}
            </div>
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <Button
            variant="outline"
            className="border-border"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            data-testid="button-prev-step"
          >
            ← 上一步
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {stepIdx + 1} / {STEPS.length}
          </span>
          <Button
            variant="outline"
            className="border-border"
            disabled={stepIdx === STEPS.length - 1}
            onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
            data-testid="button-next-step"
          >
            下一步 <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
