import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { bsmPrice, OptionType } from "@/lib/options/bsm";
import { delta, gamma, theta, vega, rho } from "@/lib/options/greeks";

const POINTS = 200;

function fmt(n: number, digits = 3): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// Adaptive Y-axis tick formatter: choose decimals from the tick magnitude so
// small Greeks (e.g. gamma ~0.04) keep resolution and big values stay compact.
// Keeps the string short enough (<= 6 chars incl. sign) to fit YAxis width.
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

// Which greek each chart plots + its intuition copy + css variable color.
type Metric = {
  key: string;
  label: string;
  intuition: string;
  color: string; // css var reference
  fn: (S: number, p: Params) => number;
};

interface Params {
  S: number;
  K: number;
  days: number;
  iv: number; // decimal
  r: number; // decimal
  q: number; // decimal
  type: OptionType;
}

function greekInput(S: number, p: Params) {
  return { S, K: p.K, T: p.days / 365, r: p.r, sigma: p.iv, q: p.q, type: p.type };
}

const METRICS: Metric[] = [
  {
    key: "price",
    label: "Price / PnL",
    intuition: "期权理论价——横轴底价越有利，价值越高（曲线即到期损益的雏形）。",
    color: "var(--primary)",
    fn: (S, p) => bsmPrice(greekInput(S, p)),
  },
  {
    key: "delta",
    label: "Delta",
    intuition: "价格每变动 1 美元，期权价格变化多少。ATM 约 ±0.5。",
    color: "var(--greek-delta)",
    fn: (S, p) => delta(greekInput(S, p)),
  },
  {
    key: "gamma",
    label: "Gamma",
    intuition: "Delta 的加速度——ATM 且临近到期时最大。",
    color: "var(--greek-gamma)",
    fn: (S, p) => gamma(greekInput(S, p)),
  },
  {
    key: "theta",
    label: "Theta / day",
    intuition: "每天流失的时间价值（每日）。买方为负，卖方为正。",
    color: "var(--greek-theta)",
    fn: (S, p) => theta(greekInput(S, p), true),
  },
  {
    key: "vega",
    label: "Vega / 1%",
    intuition: "IV 每上升 1%，期权价格变化多少。远期 ATM 最敏感。",
    color: "var(--greek-vega)",
    fn: (S, p) => vega(greekInput(S, p)),
  },
  {
    key: "rho",
    label: "Rho / 1%",
    intuition: "无风险利率每上升 1%，期权价格变化多少。",
    color: "var(--greek-rho)",
    fn: (S, p) => rho(greekInput(S, p)),
  },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-lg">
      <div className="font-mono text-[11px] text-muted-foreground">S = {fmt(Number(label), 2)}</div>
      <div className="font-mono text-xs text-foreground">{fmt(payload[0].value, 4)}</div>
    </div>
  );
}

function ParamRow({
  label,
  sub,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">
          {label} <span className="font-mono text-[10px] text-muted-foreground/60">{sub}</span>
        </Label>
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          data-testid={`input-${label.toLowerCase().replace(/[^a-z]/g, "")}`}
          className="h-7 w-24 border-border bg-muted text-right font-mono text-xs tabular"
        />
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        data-testid={`slider-${label.toLowerCase().replace(/[^a-z]/g, "")}`}
      />
      {format && (
        <div className="text-right font-mono text-[10px] text-muted-foreground/60">
          {format(value)}
        </div>
      )}
    </div>
  );
}

export default function Greeks() {
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [days, setDays] = useState(30);
  const [ivPct, setIvPct] = useState(30); // percent
  const [rPct, setRPct] = useState(4.5);
  const [qPct, setQPct] = useState(0);
  const [type, setType] = useState<OptionType>("call");

  const params: Params = useMemo(
    () => ({ S, K, days, iv: ivPct / 100, r: rPct / 100, q: qPct / 100, type }),
    [S, K, days, ivPct, rPct, qPct, type],
  );

  // Shared S-axis domain: -40% to +40% of current S.
  const { series, sMin, sMax } = useMemo(() => {
    const lo = S * 0.6;
    const hi = S * 1.4;
    const dx = (hi - lo) / (POINTS - 1);
    const rows = Array.from({ length: POINTS }, (_, i) => {
      const s = lo + i * dx;
      const row: Record<string, number> = { s };
      for (const m of METRICS) row[m.key] = m.fn(s, params);
      return row;
    });
    return { series: rows, sMin: lo, sMax: hi };
  }, [params, S]);

  // Instant values at current S for the info card + chart badges.
  const current = useMemo(() => {
    const gi = greekInput(S, params);
    return {
      price: bsmPrice(gi),
      delta: delta(gi),
      gamma: gamma(gi),
      theta: theta(gi, true),
      vega: vega(gi),
      rho: rho(gi),
    };
  }, [S, params]);

  const currentByKey: Record<string, number> = {
    price: current.price,
    delta: current.delta,
    gamma: current.gamma,
    theta: current.theta,
    vega: current.vega,
    rho: current.rho,
  };

  const infoRows = [
    { label: "Price", value: current.price, color: "var(--primary)", digits: 4 },
    { label: "Delta", value: current.delta, color: "var(--greek-delta)", digits: 4 },
    { label: "Gamma", value: current.gamma, color: "var(--greek-gamma)", digits: 5 },
    { label: "Theta/d", value: current.theta, color: "var(--greek-theta)", digits: 4 },
    { label: "Vega/1%", value: current.vega, color: "var(--greek-vega)", digits: 4 },
    { label: "Rho/1%", value: current.rho, color: "var(--greek-rho)", digits: 4 },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Greeks 交互教学</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          拖动左侧参数，观察 Greeks 曲线如何随之改变。理解 Greeks 的关键不是记公式，而是建立直觉：
          期权对哪些因素敏感、什么时候最敏感。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Parameter panel */}
        <Card className="h-fit space-y-5 border-border bg-card p-5 lg:sticky lg:top-20">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            参数 · Parameters
          </div>

          <ParamRow label="Underlying S" sub="现价" value={S} min={10} max={500} step={0.5} onChange={setS} />
          <ParamRow label="Strike K" sub="行权价" value={K} min={10} max={500} step={0.5} onChange={setK} />
          <ParamRow
            label="Days to Expiry" sub="剩余天数" value={days} min={1} max={365} step={1} onChange={setDays}
            format={(v) => `T = ${(v / 365).toFixed(4)} yr`}
          />
          <ParamRow
            label="IV sigma" sub="隐含波动率 %" value={ivPct} min={5} max={200} step={1} onChange={setIvPct}
            format={(v) => `${v}%`}
          />
          <ParamRow
            label="Risk-free r" sub="无风险利率 %" value={rPct} min={0} max={10} step={0.1} onChange={setRPct}
            format={(v) => `${v}%`}
          />
          <ParamRow
            label="Dividend q" sub="股息率 %" value={qPct} min={0} max={10} step={0.1} onChange={setQPct}
            format={(v) => `${v}%`}
          />

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Type · 方向</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as OptionType)}
              className="grid grid-cols-2 gap-2"
            >
              {(["call", "put"] as OptionType[]).map((t) => (
                <label
                  key={t}
                  htmlFor={`type-${t}`}
                  className={
                    "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium capitalize hover-elevate " +
                    (type === t ? "border-primary text-primary" : "border-border text-muted-foreground")
                  }
                >
                  <RadioGroupItem id={`type-${t}`} value={t} className="sr-only" />
                  {t}
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Current values info card */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              当前值 · at S={fmt(S, 2)}
            </div>
            <div className="space-y-1.5">
              {infoRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{r.label}</span>
                  <span
                    className="font-mono text-xs tabular"
                    style={{ color: `hsl(${r.color})` }}
                    data-testid={`value-${r.label.toLowerCase().replace(/[^a-z]/g, "")}`}
                  >
                    {fmt(r.value, r.digits)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Chart grid 3x2 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {METRICS.map((m) => (
            <Card key={m.key} className="border-border bg-card p-4" data-testid={`chart-${m.key}`}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: `hsl(${m.color})` }}
                  >
                    {m.label}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 border-border font-mono text-[10px] tabular"
                  style={{ color: `hsl(${m.color})` }}
                >
                  {fmt(currentByKey[m.key], 4)}
                </Badge>
              </div>
              <p className="mb-2 h-8 text-[11px] leading-tight text-muted-foreground">{m.intuition}</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                    <XAxis
                      dataKey="s"
                      type="number"
                      domain={[sMin, sMax]}
                      tickCount={4}
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
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.3 }} />
                    <ReferenceLine x={S} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.6} />
                    {m.key === "price" && (
                      <ReferenceLine y={0} stroke="hsl(var(--border))" strokeOpacity={0.8} />
                    )}
                    <Line
                      type="monotone"
                      dataKey={m.key}
                      stroke={`hsl(${m.color})`}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
