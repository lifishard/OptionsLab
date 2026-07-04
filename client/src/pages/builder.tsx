import { useMemo, useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Eraser, TrendingUp, TrendingDown, AlertTriangle, Flame, Repeat } from "lucide-react";
import type { Leg } from "@/lib/strategies/definitions";
import { STRATEGIES, STRATEGY_ORDER } from "@/lib/strategies/definitions";
import { payoffAtExpiry, payoffNow, entryCost, aggregateGreeks } from "@/lib/strategies/payoff";
import { LegEditor } from "@/components/leg-editor";

const R = 0.045; // risk-free rate, matches the rest of the app

// ── URL persistence (base64 JSON in ?legs=) — NO localStorage (blocked in iframe) ──
function encodeLegs(legs: Leg[]): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(legs))));
  } catch {
    return "";
  }
}
function decodeLegs(raw: string): Leg[] | null {
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((l) => l && (l.type === "call" || l.type === "put" || l.type === "stock"))
      .map((l) => ({
        type: l.type,
        side: l.side === "short" ? "short" : "long",
        K: l.type === "stock" ? undefined : Number(l.K) || 100,
        qty: Number(l.qty) || 1,
        dteOffset: l.dteOffset ? Number(l.dteOffset) : undefined,
      }));
  } catch {
    return null;
  }
}

function fmt(n: number, d = 2): string {
  if (!isFinite(n)) return "∞";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const sign = (side: Leg["side"]) => (side === "long" ? 1 : -1);

export default function Builder() {
  const { toast } = useToast();
  // Two routes feed this page:
  //   /builder                     — empty start
  //   /builder/legs/:encoded       — deep link with base64-encoded legs
  // We read the encoded param via useRoute; that avoids the wouter hash-routing
  // pitfall where `?legs=xxx` gets pushed into the outer document search instead
  // of the hash query.
  const [, params] = useRoute<{ encoded: string }>("/builder/legs/:encoded");
  const encodedParam = params?.encoded;

  // Market params
  const [S, setS] = useState(100);
  const [ivPct, setIvPct] = useState(30);
  const [dte, setDte] = useState(30);

  // Seed legs from URL once on mount.
  const [legs, setLegs] = useState<Leg[]>(() => {
    if (encodedParam) {
      const decoded = decodeLegs(encodedParam);
      if (decoded && decoded.length) return decoded;
    }
    return [];
  });

  const sigma = ivPct / 100;
  const T = dte / 365;

  // Keep the URL in sync so a builder position is shareable.
  // Path scheme: `#/builder` (empty) → `#/builder/legs/<base64>` (with legs).
  useEffect(() => {
    const target = legs.length ? `#/builder/legs/${encodeLegs(legs)}` : `#/builder`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [legs]);

  // ── Leg mutations ──
  const addLeg = useCallback(() => {
    setLegs((prev) => [...prev, { type: "call", side: "long", K: 100, qty: 1 }]);
  }, []);
  const removeLeg = (i: number) => setLegs((prev) => prev.filter((_, idx) => idx !== i));
  const clearLegs = () => setLegs([]);
  const updateLeg = (i: number, patch: Partial<Leg>) =>
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const loadTemplate = (slug: string) => {
    const def = STRATEGIES[slug];
    if (!def) return;
    // Deep clone so template legs are never mutated.
    setLegs(def.legs.map((l) => ({ ...l })));
    toast({ description: `已加载：${def.nameZh}` });
  };

  // ── Derived math ──
  const entry = useMemo(() => entryCost(legs, S, T, R, sigma), [legs, S, T, sigma]);

  const { data, breakevens, minY, maxY, maxProfit, maxLoss, unlimitedUp, unlimitedDown } =
    useMemo(() => {
      if (!legs.length) {
        return {
          data: [] as { s: number; exp: number; now: number; pos: number; neg: number }[],
          breakevens: [] as number[],
          minY: -1,
          maxY: 1,
          maxProfit: 0,
          maxLoss: 0,
          unlimitedUp: false,
          unlimitedDown: false,
        };
      }
      const strikes = legs.map((l) => l.K ?? S).filter((k) => k > 0);
      const center = strikes.length ? strikes.reduce((a, b) => a + b, 0) / strikes.length : S;
      const lo = Math.max(1, Math.min(center, S) * 0.5);
      const hi = Math.max(center, S) * 1.5;
      const steps = 120;
      const rows: { s: number; exp: number; now: number; pos: number; neg: number }[] = [];
      const bes: number[] = [];
      let prevExp = payoffAtExpiry(lo, legs, entry, R, sigma);
      let mp = -Infinity;
      let ml = Infinity;
      for (let i = 0; i <= steps; i++) {
        const s = lo + ((hi - lo) * i) / steps;
        const exp = payoffAtExpiry(s, legs, entry, R, sigma);
        const now = payoffNow(s, legs, T, R, sigma, entry);
        rows.push({ s, exp, now, pos: Math.max(exp, 0), neg: Math.min(exp, 0) });
        mp = Math.max(mp, exp);
        ml = Math.min(ml, exp);
        if (i > 0 && prevExp * exp < 0) {
          const s0 = lo + ((hi - lo) * (i - 1)) / steps;
          bes.push(s0 + ((s - s0) * (0 - prevExp)) / (exp - prevExp));
        }
        prevExp = exp;
      }
      // Detect unbounded tails from slope at the extremes.
      const nEnd = rows.length - 1;
      const upSlope = rows[nEnd].exp - rows[nEnd - 1].exp;
      const downSlope = rows[0].exp - rows[1].exp;
      const uUp = upSlope > 0.01;
      const uDown = downSlope > 0.01;
      const ys = rows.flatMap((r) => [r.exp, r.now]);
      return {
        data: rows,
        breakevens: bes,
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        maxProfit: uUp ? Infinity : mp,
        maxLoss: uDown ? -Infinity : ml,
        unlimitedUp: uUp,
        unlimitedDown: uDown,
      };
    }, [legs, entry, T, sigma, S]);

  const greeks = useMemo(() => aggregateGreeks(S, legs, T, R, sigma), [S, legs, T, sigma]);
  const radarData = useMemo(() => {
    const scale = { delta: 1, gamma: 20, theta: 20, vega: 5, rho: 5 } as const;
    return [
      { g: "Δ", v: Math.min(Math.abs(greeks.delta) * scale.delta, 1) },
      { g: "Γ", v: Math.min(Math.abs(greeks.gamma) * scale.gamma, 1) },
      { g: "Θ", v: Math.min(Math.abs(greeks.theta) * scale.theta, 1) },
      { g: "ν", v: Math.min(Math.abs(greeks.vega) * scale.vega, 1) },
      { g: "Ρ", v: Math.min(Math.abs(greeks.rho) * scale.rho, 1) },
    ];
  }, [greeks]);

  // 5×5 sensitivity heatmap: X = S shift, Y = days forward.
  const heat = useMemo(() => {
    if (!legs.length) return null;
    const sShifts = [-0.1, -0.05, 0, 0.05, 0.1];
    const dayFwd = [0, 7, 14, 21, 28];
    const cells: { x: number; y: number; pnl: number }[] = [];
    let absMax = 1e-6;
    for (let yi = 0; yi < dayFwd.length; yi++) {
      const tRem = Math.max(1e-6, (dte - dayFwd[yi]) / 365);
      for (let xi = 0; xi < sShifts.length; xi++) {
        const s = S * (1 + sShifts[xi]);
        const pnl = payoffNow(s, legs, tRem, R, sigma, entry);
        cells.push({ x: xi, y: yi, pnl });
        absMax = Math.max(absMax, Math.abs(pnl));
      }
    }
    return { cells, sShifts, dayFwd, absMax };
  }, [legs, S, dte, sigma, entry]);

  // Validation: stock legs are conventionally 100-share round lots.
  const stockWarn = legs.some(
    (l) => l.type === "stock" && l.qty > 0 && (l.qty * 100) % 100 !== 0,
  );

  const netCostLabel =
    legs.length === 0 ? "—" : (entry >= 0 ? "净支出 " : "净收入 ") + fmt(Math.abs(entry));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Phase 4 · Position Builder
      </div>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="builder-title">
        组合编辑器
        <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
          · 自由拼多腿仓位
        </span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        加几条腿，或从策略模板一键载入。右边实时给你到期损益、当前理论 PnL、盈亏平衡、聚合
        Greeks，还有一张「股价 × 时间」的敏感度热力图。底层就是本项目那套 BSM + payoff 引擎。
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ── Left: leg editor (~40%) ── */}
        <div className="space-y-4 lg:col-span-2">
          {/* Template loader + actions */}
          <Card className="border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Select onValueChange={loadTemplate}>
                <SelectTrigger className="h-9 flex-1 text-xs" data-testid="select-template">
                  <SelectValue placeholder="从策略加载 ▼" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {STRATEGY_ORDER.map((slug) => {
                    const d = STRATEGIES[slug];
                    if (!d) return null;
                    return (
                      <SelectItem key={slug} value={slug} className="text-xs">
                        {d.nameZh}
                        <span className="ml-1 text-muted-foreground">· {d.nameEn}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-1.5" onClick={addLeg} data-testid="button-add-leg">
                <Plus className="h-3.5 w-3.5" /> 加一条腿
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={clearLegs}
                disabled={!legs.length}
                data-testid="button-clear"
              >
                <Eraser className="h-3.5 w-3.5" /> 清空
              </Button>
            </div>
            {legs.length > 0 && (
              <Link
                href={`/stress/legs/${encodeLegs(legs)}`}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-[hsl(var(--pnl-negative)/0.5)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--pnl-negative))] transition-colors hover:bg-[hsl(var(--pnl-negative)/0.1)]"
                data-testid="link-stress-test"
              >
                <Flame className="h-3.5 w-3.5" /> 压力测试当前持仓
              </Link>
            )}
            {legs.length > 0 && (
              <Link
                href={`/roll/legs/${encodeLegs(legs)}`}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                data-testid="link-roll"
              >
                <Repeat className="h-3.5 w-3.5" /> 移仓（作为 base）
              </Link>
            )}
          </Card>

          {/* Legs */}
          {legs.length === 0 ? (
            <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed border-border bg-card/50 p-6 text-center" data-testid="empty-legs">
              <SlidersIcon />
              <p className="mt-3 text-sm text-muted-foreground">
                还没有腿。点击 “+ 加一条腿” 或从策略模板开始。
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {legs.map((leg, i) => (
                <LegEditor
                  key={i}
                  index={i}
                  leg={leg}
                  onChange={(patch) => updateLeg(i, patch)}
                  onRemove={() => removeLeg(i)}
                />
              ))}
            </div>
          )}

          {/* Market params */}
          <Card className="border-border bg-card p-4">
            <div className="mb-3 text-xs font-medium text-muted-foreground">市场参数</div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
              <ParamSlider label="股价 S" value={S} unit="" min={40} max={160} step={1} onChange={setS} testid="slider-s" />
              <ParamSlider label="DTE" value={dte} unit="天" min={1} max={180} step={1} onChange={setDte} testid="slider-dte" />
              <ParamSlider label="σ" value={ivPct} unit="%" min={5} max={120} step={1} onChange={setIvPct} testid="slider-iv" />
            </div>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">r = 4.5% 固定</div>
          </Card>

          {stockWarn && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] leading-relaxed text-amber-300"
              data-testid="warn-stock-lot"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>股票通常 100 股为一手。这里 qty 是「手数」，1 手 = 100 股——检查一下数量对不对。</span>
            </div>
          )}
        </div>

        {/* ── Right: analytics (~60%) ── */}
        <div className="space-y-4 lg:col-span-3">
          {legs.length === 0 ? (
            <Card className="flex min-h-[420px] flex-col items-center justify-center border-dashed border-border bg-card/50 p-8 text-center" data-testid="empty-analytics">
              <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                加上腿之后，这里会画出损益曲线、算出盈亏平衡、聚合 Greeks 和敏感度热力图。
              </p>
            </Card>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi
                  label="最大盈利"
                  value={unlimitedUp ? "无限" : fmt(maxProfit)}
                  color="var(--pnl-positive)"
                  testid="kpi-maxprofit"
                />
                <Kpi
                  label="最大亏损"
                  value={unlimitedDown ? "无限" : fmt(maxLoss)}
                  color="var(--pnl-negative)"
                  testid="kpi-maxloss"
                />
                <Kpi
                  label="净成本"
                  value={netCostLabel}
                  color={entry >= 0 ? "var(--greek-theta)" : "var(--primary)"}
                  testid="kpi-netcost"
                />
                <Kpi
                  label="盈亏平衡"
                  value={breakevens.length ? breakevens.map((b) => fmt(b, 1)).join(" , ") : "—"}
                  color="var(--greek-rho)"
                  testid="kpi-breakeven"
                />
              </div>

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
                <div className="h-72" data-testid="chart-payoff">
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
                        width={48}
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
                      <ReferenceLine x={S} stroke="hsl(var(--greek-delta))" strokeOpacity={0.4} strokeDasharray="3 3" />
                      <Line dataKey="now" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                      <Line dataKey="exp" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                      {breakevens.map((be, i) => (
                        <ReferenceDot key={i} x={be} y={0} r={4} fill="hsl(var(--greek-rho))" stroke="hsl(var(--background))" strokeWidth={2} />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Greek radar */}
                <Card className="border-border bg-card p-4">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">聚合 Greeks（绝对值 · 归一化）</div>
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
                    <span style={{ color: "hsl(var(--greek-delta))" }}>Δ {fmt(greeks.delta, 3)}</span>
                    <span style={{ color: "hsl(var(--greek-gamma))" }}>Γ {fmt(greeks.gamma, 4)}</span>
                    <span style={{ color: "hsl(var(--greek-theta))" }}>Θ {fmt(greeks.theta, 4)}</span>
                    <span style={{ color: "hsl(var(--greek-vega))" }}>ν {fmt(greeks.vega, 4)}</span>
                    <span style={{ color: "hsl(var(--greek-rho))" }}>Ρ {fmt(greeks.rho, 4)}</span>
                  </div>
                  <div className="h-52" data-testid="chart-radar">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} outerRadius="70%">
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="g" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontFamily: "var(--font-mono)" }} />
                        <Radar dataKey="v" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} isAnimationActive={false} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Sensitivity heatmap */}
                <Card className="border-border bg-card p-4">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">敏感度热力图</div>
                  <div className="mb-3 font-mono text-[10px] text-muted-foreground">
                    横轴 = 股价 ±%，纵轴 = 向前推进天数 · 单元格 = 当前理论 PnL
                  </div>
                  {heat && <Heatmap heat={heat} />}
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ParamSlider({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  testid,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  testid: string;
}) {
  return (
    <div>
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
        onValueChange={(v) => onChange(v[0])}
        data-testid={testid}
      />
    </div>
  );
}

function Kpi({ label, value, color, testid }: { label: string; value: string; color: string; testid: string }) {
  return (
    <Card className="border-border bg-card p-3" data-testid={testid}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold" style={{ color: `hsl(${color})` }} title={value}>
        {value}
      </div>
    </Card>
  );
}

function Heatmap({
  heat,
}: {
  heat: { cells: { x: number; y: number; pnl: number }[]; sShifts: number[]; dayFwd: number[]; absMax: number };
}) {
  const { cells, sShifts, dayFwd, absMax } = heat;
  const color = (pnl: number) => {
    const t = Math.min(Math.abs(pnl) / absMax, 1);
    if (pnl >= 0) return `hsl(var(--pnl-positive) / ${0.12 + t * 0.78})`;
    return `hsl(var(--pnl-negative) / ${0.12 + t * 0.78})`;
  };
  const get = (x: number, y: number) => cells.find((c) => c.x === x && c.y === y)?.pnl ?? 0;
  return (
    <div className="overflow-x-auto" data-testid="heatmap">
      <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="w-10" />
            {sShifts.map((s) => (
              <th key={s} className="pb-1 text-center font-mono text-[9px] font-normal text-muted-foreground">
                {s > 0 ? "+" : ""}
                {(s * 100).toFixed(0)}%
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dayFwd.map((d, yi) => (
            <tr key={d}>
              <td className="pr-1 text-right font-mono text-[9px] text-muted-foreground">+{d}d</td>
              {sShifts.map((_, xi) => {
                const pnl = get(xi, yi);
                return (
                  <td
                    key={xi}
                    className="h-8 rounded-sm text-center font-mono text-[9px] font-medium"
                    style={{ background: color(pnl), color: "hsl(var(--foreground))" }}
                    title={`PnL ${fmt(pnl)}`}
                    data-testid={`heat-${xi}-${yi}`}
                  >
                    {fmt(pnl, 0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// simple inline sliders icon for empty state
function SlidersIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/40">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}
