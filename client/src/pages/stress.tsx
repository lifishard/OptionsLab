import { useMemo, useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, RotateCcw, Skull, Info } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Leg } from "@/lib/strategies/definitions";
import {
  computeScenarioCurve,
  computeScenarioAt,
  computeThetaDaily,
  DOOMSDAY_PRESET,
  DEFAULT_IV,
  DEFAULT_DTE,
  type ScenarioParams,
  type ScenarioPoint,
  type StressLeg,
} from "@/lib/scenario/engine";

const R = 0.045;
const TICKERS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA"] as const;
type Ticker = (typeof TICKERS)[number];

// ── deep-link codec (identical scheme to builder / chain) ──
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

function fmtMoney(n: number | null | undefined, d = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${n < 0 ? "-" : ""}$${abs}`;
}
function fmtNum(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pctDelta(cur: number, scen: number): { label: string; positive: boolean } | null {
  if (!isFinite(cur) || cur === 0) return null;
  const pct = ((scen - cur) / Math.abs(cur)) * 100;
  if (!isFinite(pct)) return null;
  return { label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, positive: pct >= 0 };
}

// ── Chain snapshot types (mirror chain.tsx) ──
interface OptionRow { strike: number; iv: number | null }
interface StrikeRow { K: number; call: OptionRow; put: OptionRow }
interface ExpiryGroup { date: string; dte: number; strikes: StrikeRow[] }
interface ChainSnapshot { symbol: string; spot: number; expiries: ExpiryGroup[] }
interface Portfolio { id: number; symbol: string; name: string; legs: string; memo: string | null; createdAt: number }

// Greek color tokens (HSL triplets from index.css)
const COLOR = {
  pnl: "var(--greek-vega)",
  pnlMid: "340 82% 58%",
  pnlFar: "0 84% 60%",
  delta: "var(--greek-delta)",
  gamma: "var(--greek-gamma)",
  theta: "var(--greek-theta)",
  vega: "var(--greek-vega)",
  pos: "var(--pnl-positive)",
  neg: "var(--pnl-negative)",
};

export default function Stress() {
  const [, params] = useRoute<{ encoded: string }>("/stress/legs/:encoded");
  const encodedParam = params?.encoded;

  const [symbol, setSymbol] = useState<Ticker>("AAPL");
  const [legs, setLegs] = useState<Leg[]>(() => {
    if (encodedParam) {
      const d = decodeLegs(encodedParam);
      if (d && d.length) return d;
    }
    return [];
  });

  // Re-seed when a fresh deep-link mounts the same component.
  useEffect(() => {
    if (encodedParam) {
      const d = decodeLegs(encodedParam);
      if (d && d.length) setLegs(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encodedParam]);

  // ── Scenario Control state (raw values in %/days) ──
  const [spotRangePct, setSpotRangePct] = useState<[number, number]>([-33, 49.2]);
  const [daysForward, setDaysForward] = useState(0);
  const [ivShiftPctUi, setIvShiftPctUi] = useState(0); // percent
  const [doomActive, setDoomActive] = useState(false);

  // Debounce the heavy triple so dragging is smooth (60ms).
  const debSpotRange = useDebouncedValue(spotRangePct, 60);
  const debDays = useDebouncedValue(daysForward, 60);
  const debIv = useDebouncedValue(ivShiftPctUi, 60);

  const chainQuery = useQuery<ChainSnapshot>({ queryKey: ["/api/chain", symbol] });
  const portfoliosQuery = useQuery<Portfolio[]>({ queryKey: ["/api/portfolios", symbol] });
  const spot = chainQuery.data?.spot ?? 100;

  // ── Enrich legs with IV + DTE borrowed from the live chain (fallback defaults) ──
  const stressLegs: StressLeg[] = useMemo(() => {
    return legs.map((leg) => {
      if (leg.type === "stock" || leg.K === undefined) {
        return { ...leg, iv: DEFAULT_IV, dte: DEFAULT_DTE };
      }
      let iv = DEFAULT_IV;
      let dte = DEFAULT_DTE;
      const snap = chainQuery.data;
      if (snap) {
        for (const exp of snap.expiries) {
          const row = exp.strikes.find((s) => s.K === leg.K);
          if (row) {
            const side = leg.type === "call" ? row.call : row.put;
            if (side.iv) {
              iv = side.iv;
              dte = exp.dte;
              break;
            }
          }
        }
      }
      return { ...leg, iv, dte };
    });
  }, [legs, chainQuery.data]);

  const hasLegs = stressLegs.length > 0;

  // Spot-range endpoints in dollars (drive every chart's x-axis).
  const spotRange = useMemo<[number, number]>(() => {
    const lo = spot * (1 + debSpotRange[0] / 100);
    const hi = spot * (1 + debSpotRange[1] / 100);
    return [Math.max(0.01, Math.min(lo, hi)), Math.max(lo, hi)];
  }, [spot, debSpotRange]);

  const scenParams: ScenarioParams = useMemo(
    () => ({
      spotShiftPct: debSpotRange[0] / 100, // "current scenario" anchor = the low (crash) edge
      daysForward: debDays,
      ivShiftPct: debIv / 100,
      rfRate: R,
    }),
    [debSpotRange, debDays, debIv],
  );

  // ── The five curves + theta daily (guarded for empty legs) ──
  const curves = useMemo(() => {
    if (!hasLegs) return null;
    try {
      const now = computeScenarioCurve(stressLegs, spot, { ...scenParams, daysForward: 0 }, spotRange, 121);
      const mid = computeScenarioCurve(stressLegs, spot, { ...scenParams, daysForward: Math.round(scenParams.daysForward / 2) }, spotRange, 121);
      const far = computeScenarioCurve(stressLegs, spot, scenParams, spotRange, 121);
      return { now, mid, far };
    } catch {
      return null;
    }
  }, [hasLegs, stressLegs, spot, scenParams, spotRange]);

  const thetaDaily = useMemo(() => {
    if (!hasLegs) return null;
    try {
      return computeThetaDaily(stressLegs, spot, scenParams, 30);
    } catch {
      return null;
    }
  }, [hasLegs, stressLegs, spot, scenParams]);

  // Merge the three PnL snapshots into one dataset keyed by spot index.
  const pnlData = useMemo(() => {
    if (!curves) return [];
    return curves.now.map((p, i) => ({
      spot: p.spot,
      now: p.pnl,
      mid: curves.mid[i]?.pnl,
      far: curves.far[i]?.pnl,
    }));
  }, [curves]);

  // Current-vs-scenario cash for the 5 cards.
  const currentAt = useMemo(
    () => (hasLegs ? computeScenarioAt(stressLegs, spot, { spotShiftPct: 0, daysForward: 0, ivShiftPct: 0, rfRate: R }) : null),
    [hasLegs, stressLegs, spot],
  );
  const scenarioAt = useMemo(
    () => (hasLegs ? computeScenarioAt(stressLegs, spot, scenParams) : null),
    [hasLegs, stressLegs, spot, scenParams],
  );

  // ── Controls ──
  const applyDoomsday = useCallback(() => {
    setSpotRangePct([DOOMSDAY_PRESET.spotShiftPct * 100, Math.abs(DOOMSDAY_PRESET.spotShiftPct * 100) + 20]);
    setDaysForward(DOOMSDAY_PRESET.daysForward);
    setIvShiftPctUi(DOOMSDAY_PRESET.ivShiftPct * 100);
    setDoomActive(true);
    setTimeout(() => setDoomActive(false), 1200);
  }, []);
  const applyReset = useCallback(() => {
    setSpotRangePct([-33, 49.2]);
    setDaysForward(0);
    setIvShiftPctUi(0);
  }, []);

  const loadPortfolio = useCallback(
    (idStr: string) => {
      if (idStr === "__none__") {
        setLegs([]);
        return;
      }
      const p = portfoliosQuery.data?.find((x) => x.id === Number(idStr));
      if (!p) return;
      try {
        const parsed = JSON.parse(p.legs);
        if (Array.isArray(parsed)) setLegs(parsed);
      } catch {
        /* ignore malformed */
      }
    },
    [portfoliosQuery.data],
  );

  // ── Verdict (老欧) ──
  // Initial capital proxy: absolute entry cost of the position (sum of |leg premium| × 100 × qty),
  // floored so tiny positions don't blow up the ratio.
  const initialCapital = useMemo(() => {
    if (!hasLegs || !currentAt) return 1;
    // Use notional of the max spot as a rough capital base for teaching purposes.
    const notional = stressLegs.reduce((s, l) => s + (l.type === "stock" ? spot * 100 : (l.K ?? spot) * 100) * l.qty, 0);
    return Math.max(notional * 0.1, 1000);
  }, [hasLegs, currentAt, stressLegs, spot]);

  const verdict = useMemo(() => {
    if (!scenarioAt) return null;
    const pnl = scenarioAt.pnl;
    if (pnl > -0.05 * initialCapital) return { text: "死不了就还好~", tone: "pos" as const };
    if (pnl > -0.2 * initialCapital) return { text: "肉疼但撑得住", tone: "warn" as const };
    return { text: "该跑了朋友", tone: "neg" as const };
  }, [scenarioAt, initialCapital]);

  const currentSpotShifted = spot * (1 + debSpotRange[0] / 100);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Skull className="h-3.5 w-3.5" /> Phase 6 · Doomsday Stress Test
      </div>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="stress-title">
        末日压力测试
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        三个滑块一起拧：<span className="text-foreground">股价崩多少</span> ·{" "}
        <span className="text-foreground">时间跳几天</span> ·{" "}
        <span className="text-foreground">恐慌指数（IV）翻多少</span>。五张曲线 + 一张每日 Theta 柱状图实时联动。你的持仓，防不防得住世界末日？
      </p>

      {/* Topbar */}
      <Card className="mt-6 border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-muted-foreground">LOAD PORTFOLIO</span>
            <Select onValueChange={loadPortfolio}>
              <SelectTrigger className="h-8 w-[220px] text-xs" data-testid="select-load-portfolio">
                <SelectValue placeholder="从 SQLite 载入持仓…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">空白 · 清空持仓</SelectItem>
                {(portfoliosQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              {TICKERS.map((t) => (
                <button
                  key={t}
                  onClick={() => setSymbol(t)}
                  className={
                    "rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors " +
                    (symbol === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")
                  }
                  data-testid={`button-symbol-${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-muted-foreground">spot</span>
            {chainQuery.isLoading ? <Skeleton className="h-4 w-16" /> : <span data-testid="text-spot">${fmtNum(spot, 2)}</span>}
            <span className="text-muted-foreground">· legs</span>
            <span data-testid="text-legcount">{legs.length}</span>
          </div>
        </div>
      </Card>

      {/* Empty state */}
      {!hasLegs ? (
        <Card className="mt-4 flex flex-col items-center justify-center gap-3 border-dashed border-border bg-card p-16 text-center" data-testid="stress-empty">
          <Skull className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">先加个持仓</p>
          <p className="max-w-md text-xs text-muted-foreground">
            从上方下拉载入一份已保存的持仓，或者去<Link href="/chain" className="text-primary underline-offset-4 hover:underline" data-testid="link-empty-chain"> 期权链 </Link>/<Link href="/builder" className="text-primary underline-offset-4 hover:underline" data-testid="link-empty-builder"> 组合编辑器 </Link>点“送到压力测试”把持仓带过来。没有持仓，压力无从谈起。
          </p>
        </Card>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          {/* ── LEFT: Scenario Control ── */}
          <div className="space-y-4">
            <Card className="border-border bg-card p-4" data-testid="scenario-control">
              <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <Info className="h-3.5 w-3.5" /> Scenario Control
              </div>

              {/* Spot Shift range */}
              <div className="mb-6">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">Spot 冲击</span>
                  <span className="font-mono text-[11px] text-primary" data-testid="text-spotrange">
                    {spotRangePct[0].toFixed(1)}% / +{spotRangePct[1].toFixed(1)}%
                  </span>
                </div>
                <Slider
                  min={-80}
                  max={230}
                  step={0.1}
                  value={spotRangePct}
                  onValueChange={(v) => setSpotRangePct([v[0], v[1]] as [number, number])}
                  data-testid="slider-spot"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {[30, 15, 0].map((v) => (
                    <button
                      key={v}
                      onClick={() => setSpotRangePct([-v, v || 15])}
                      className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                      data-testid={`preset-spot-${v}`}
                    >
                      ±{v}%
                    </button>
                  ))}
                </div>
              </div>

              {/* T+n Days */}
              <div className="mb-6">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">T+n Days（时间快进）</span>
                  <span className="font-mono text-[11px] text-primary" data-testid="text-days">{daysForward} d</span>
                </div>
                <Slider min={0} max={250} step={1} value={[daysForward]} onValueChange={(v) => setDaysForward(v[0])} data-testid="slider-days" />
              </div>

              {/* IV Shift */}
              <div className="mb-6">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">IV Shift（恐慌指数）</span>
                  <span className="font-mono text-[11px] text-primary" data-testid="text-iv">{ivShiftPctUi >= 0 ? "+" : ""}{ivShiftPctUi.toFixed(0)}%</span>
                </div>
                <Slider min={-100} max={200} step={1} value={[ivShiftPctUi]} onValueChange={(v) => setIvShiftPctUi(v[0])} data-testid="slider-iv" />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={applyDoomsday}
                  className={"flex-1 gap-1.5 bg-[hsl(var(--pnl-negative))] text-white transition-shadow hover:bg-[hsl(var(--pnl-negative))] " + (doomActive ? "shadow-[0_0_24px_hsl(var(--pnl-negative)/0.8)]" : "shadow-[0_0_10px_hsl(var(--pnl-negative)/0.4)]")}
                  data-testid="button-doomsday"
                >
                  <Flame className="h-3.5 w-3.5" /> 末日按钮
                </Button>
                <Button variant="outline" onClick={applyReset} className="gap-1.5 border-border" data-testid="button-reset">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              </div>
            </Card>

            {/* 老欧 verdict card */}
            {verdict && (
              <Card
                className="border-border bg-card p-4"
                style={{
                  borderColor: verdict.tone === "pos" ? "hsl(var(--pnl-positive)/0.5)" : verdict.tone === "neg" ? "hsl(var(--pnl-negative)/0.5)" : "hsl(var(--greek-theta)/0.5)",
                }}
                data-testid="verdict-card"
              >
                <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">老欧点评 · Verdict</div>
                <div
                  className="text-lg font-semibold"
                  style={{ color: verdict.tone === "pos" ? "hsl(var(--pnl-positive))" : verdict.tone === "neg" ? "hsl(var(--pnl-negative))" : "hsl(var(--greek-theta))" }}
                  data-testid="verdict-text"
                >
                  {verdict.text}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  这轮压力：股价{debSpotRange[0] < 0 ? "崩" : "涨"}{Math.abs(debSpotRange[0]).toFixed(0)}% + 时间跳{debDays}天 + 恐慌指数{debIv >= 0 ? "翻" : "降"}{Math.abs(debIv).toFixed(0)}%。
                  扰动后组合盈亏约 <span style={{ color: (scenarioAt?.pnl ?? 0) >= 0 ? "hsl(var(--pnl-positive))" : "hsl(var(--pnl-negative))" }}>{fmtMoney(scenarioAt?.pnl)}</span>。
                  死不了，就还好~
                </p>
              </Card>
            )}
          </div>

          {/* ── RIGHT: cards + charts ── */}
          <div className="space-y-4">
            {/* 5 Greeks Cash cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <CashCard label="PNL" cur={0} scen={scenarioAt?.pnl ?? 0} color={COLOR.pnl} testid="card-pnl" money />
              <CashCard label="DELTA CASH" cur={currentAt?.deltaCash ?? 0} scen={scenarioAt?.deltaCash ?? 0} color={COLOR.delta} testid="card-delta" money />
              <CashCard label="1% GAMMA CASH" cur={currentAt?.gammaCash ?? 0} scen={scenarioAt?.gammaCash ?? 0} color={COLOR.gamma} testid="card-gamma" money />
              <CashCard label="THETA CASH" cur={currentAt?.thetaCash ?? 0} scen={scenarioAt?.thetaCash ?? 0} color={COLOR.theta} testid="card-theta" money />
              <CashCard label="VEGA CASH" cur={currentAt?.vegaCash ?? 0} scen={scenarioAt?.vegaCash ?? 0} color={COLOR.vega} testid="card-vega" money />
            </div>

            {/* PNL Scenario (3 curves) */}
            <ChartCard title="PNL SCENARIO" hint="三条线：现在 / 时间过半 / T+n 天后。看崩盘那一侧掉多深。" testid="chart-pnl">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={pnlData} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="spot" tickFormatter={(v) => fmtNum(v, 0)} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis tickFormatter={(v) => fmtMoney(v)} stroke="hsl(var(--muted-foreground))" fontSize={10} width={54} />
                  <Tooltip content={<PnlTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <ReferenceLine x={currentSpotShifted} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="now" stroke={`hsl(${COLOR.pnl})`} dot={false} strokeWidth={2} name="Now" />
                  <Line type="monotone" dataKey="mid" stroke={`hsl(${COLOR.pnlMid})`} dot={false} strokeWidth={1.5} strokeDasharray="5 3" name="T/2" />
                  <Line type="monotone" dataKey="far" stroke={`hsl(${COLOR.pnlFar})`} dot={false} strokeWidth={2} name={`T+${debDays}`} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 2×2 Cash scenario grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CashCurveCard title="DELTA CASH SCENARIO" hint="价格每动一块，仓位赚/亏多少钱。崩盘时你还剩多少 Delta？" data={curves?.far} dataKey="deltaCash" color={COLOR.delta} currentSpot={currentSpotShifted} testid="chart-delta" />
              <CashCurveCard title="GAMMA CASH SCENARIO" hint="Delta 变得多快。Gamma 大 = 行情一动仓位就‘活’，双刃剑。" data={curves?.far} dataKey="gammaCash" color={COLOR.gamma} currentSpot={currentSpotShifted} testid="chart-gamma" />
              <CashCurveCard title="THETA CASH SCENARIO" hint="每天时间价值的收/付。山峰型说明你在 ATM 附近收租最凶。" data={curves?.far} dataKey="thetaCash" color={COLOR.theta} currentSpot={currentSpotShifted} testid="chart-theta" />
              <CashCurveCard title="VEGA CASH SCENARIO" hint="IV 每涨一个点赚/亏多少。恐慌来袭时，这条线告诉你是朋友还是敌人。" data={curves?.far} dataKey="vegaCash" color={COLOR.vega} currentSpot={currentSpotShifted} testid="chart-vega" />
            </div>

            {/* THETA CASH DAILY bars */}
            <ChartCard title="THETA CASH DAILY" hint="从今天到 T+30，每天的 Theta 现金。绿=收权利金，红=付权利金。" testid="chart-theta-daily">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={thetaDaily ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={9} interval={4} />
                  <YAxis tickFormatter={(v) => fmtMoney(v)} stroke="hsl(var(--muted-foreground))" fontSize={10} width={54} />
                  <Tooltip content={<DailyTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar dataKey="thetaCash" radius={[2, 2, 0, 0]}>
                    {(thetaDaily ?? []).map((d, i) => (
                      <Cell key={i} fill={d.thetaCash >= 0 ? "hsl(var(--pnl-positive))" : "hsl(var(--pnl-negative))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function CashCard({ label, cur, scen, color, testid, money }: { label: string; cur: number; scen: number; color: string; testid: string; money?: boolean }) {
  const d = pctDelta(cur, scen);
  const fmt = money ? (n: number) => fmtMoney(n) : (n: number) => fmtNum(n, 2);
  return (
    <Card className="border-border bg-card p-3" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground/70" data-testid={`${testid}-current`}>现值 {fmt(cur)}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="truncate font-mono text-sm font-semibold" style={{ color: `hsl(${color})` }} data-testid={`${testid}-scenario`}>
          {fmt(scen)}
        </span>
        {d && (
          <span
            className="rounded px-1 font-mono text-[9px] font-bold"
            style={{
              background: d.positive ? "hsl(var(--pnl-positive)/0.15)" : "hsl(var(--pnl-negative)/0.15)",
              color: d.positive ? "hsl(var(--pnl-positive))" : "hsl(var(--pnl-negative))",
            }}
          >
            {d.label}
          </span>
        )}
      </div>
    </Card>
  );
}

function ChartCard({ title, hint, children, testid }: { title: string; hint: string; children: React.ReactNode; testid: string }) {
  return (
    <Card className="border-border bg-card p-4" data-testid={testid}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
      {children}
      <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
        <span className="text-foreground">老欧：</span>{hint}
      </p>
    </Card>
  );
}

function CashCurveCard({
  title, hint, data, dataKey, color, currentSpot, testid,
}: {
  title: string; hint: string; data: ScenarioPoint[] | undefined; dataKey: keyof ScenarioPoint; color: string; currentSpot: number; testid: string;
}) {
  return (
    <ChartCard title={title} hint={hint} testid={testid}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="spot" tickFormatter={(v) => fmtNum(v, 0)} stroke="hsl(var(--muted-foreground))" fontSize={10} />
          <YAxis tickFormatter={(v) => fmtMoney(v)} stroke="hsl(var(--muted-foreground))" fontSize={10} width={54} />
          <Tooltip
            formatter={(v: number) => [fmtMoney(v), title.replace(" SCENARIO", "")]}
            labelFormatter={(l) => `spot $${fmtNum(l as number, 2)}`}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <ReferenceLine x={currentSpot} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
          <Line type="monotone" dataKey={dataKey as string} stroke={`hsl(${color})`} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PnlTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-[11px]">
      <div className="mb-1 font-mono text-muted-foreground">spot ${fmtNum(label, 2)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono">{fmtMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
function DailyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-[11px]">
      <div className="font-mono text-muted-foreground">{label}</div>
      <div className="font-mono" style={{ color: v >= 0 ? "hsl(var(--pnl-positive))" : "hsl(var(--pnl-negative))" }}>{fmtMoney(v)} / day</div>
    </div>
  );
}
