import { useMemo, useState, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, ArrowRight, RefreshCw, Save, Table2, GraduationCap, Info } from "lucide-react";
import type { Leg } from "@/lib/strategies/definitions";
import { theta as bsmTheta, delta as bsmDelta, gamma as bsmGamma, vega as bsmVega } from "@/lib/options/greeks";
import {
  deltaCash,
  thetaCash,
  gammaCash,
  vegaSum,
  aprBackground,
  netQtyAtStrike,
  type LegGreeks,
} from "@/lib/options/chain-math";

const TICKERS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA"] as const;
type Ticker = (typeof TICKERS)[number];

const R = 0.045;

// ── Types mirroring server/yfinance.ts ChainSnapshot ──
interface OptionRow {
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
interface StrikeRow {
  K: number;
  call: OptionRow;
  put: OptionRow;
}
interface ExpiryGroup {
  date: string;
  dte: number;
  strikes: StrikeRow[];
}
interface ChainSnapshot {
  symbol: string;
  spot: number;
  changePercent: number;
  fetchedAt: number;
  expiries: ExpiryGroup[];
}

interface Portfolio {
  id: number;
  symbol: string;
  name: string;
  legs: string; // JSON string of Leg[]
  memo: string | null;
  createdAt: number;
}

// base64(JSON) — same scheme builder.tsx / scenarios.tsx use.
function encodeLegs(legs: Leg[]): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(legs))));
  } catch {
    return "";
  }
}

function fmt(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}$${s}`;
}

export default function Chain() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [symbol, setSymbol] = useState<Ticker>("SPY");
  const [currentPortfolioId, setCurrentPortfolioId] = useState<number | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMemo, setSaveMemo] = useState("");
  const [beginnerMode, setBeginnerMode] = useState(false);

  const chainQuery = useQuery<ChainSnapshot>({
    queryKey: ["/api/chain", symbol],
  });

  const portfoliosQuery = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios", symbol],
  });

  const spot = chainQuery.data?.spot ?? 0;

  // ── Compute greeks for each leg using existing BSM lib (client-side, live spot) ──
  const legGreeks: LegGreeks[] = useMemo(() => {
    if (!chainQuery.data) return legs.map(() => ({ delta: 0, gamma: 0, theta: 0, vega: 0 }));
    return legs.map((leg) => {
      if (leg.type === "stock" || leg.K === undefined) {
        return { delta: 1, gamma: 0, theta: 0, vega: 0 };
      }
      // Find matching strike/expiry row to borrow its solved IV; fall back to 30%.
      let sigma = 0.3;
      let dte = 30;
      for (const exp of chainQuery.data.expiries) {
        const row = exp.strikes.find((s) => s.K === leg.K);
        if (row) {
          const side = leg.type === "call" ? row.call : row.put;
          if (side.iv) {
            sigma = side.iv;
            dte = exp.dte;
            break;
          }
        }
      }
      const T = Math.max(dte, 1) / 365;
      const input = { S: spot, K: leg.K, T, r: R, sigma, type: leg.type as "call" | "put" };
      return {
        delta: bsmDelta(input),
        gamma: bsmGamma(input),
        theta: bsmTheta(input),
        vega: bsmVega(input),
      };
    });
  }, [legs, chainQuery.data, spot]);

  const dCash = useMemo(() => deltaCash(legs, legGreeks, spot), [legs, legGreeks, spot]);
  const tCash = useMemo(() => thetaCash(legs, legGreeks), [legs, legGreeks]);
  const gCash = useMemo(() => gammaCash(legs, legGreeks, spot), [legs, legGreeks, spot]);
  const vSum = useMemo(() => vegaSum(legs, legGreeks), [legs, legGreeks]);
  const spotShares = useMemo(
    () => legs.filter((l) => l.type === "stock").reduce((s, l) => s + (l.side === "long" ? 1 : -1) * l.qty * 100, 0),
    [legs],
  );

  const handleSelectTicker = useCallback((t: Ticker) => {
    setSymbol(t);
    setCurrentPortfolioId(null);
    setLegs([]);
  }, []);

  const handleSelectPortfolio = useCallback(
    (idStr: string) => {
      if (idStr === "__none__") {
        setCurrentPortfolioId(null);
        setLegs([]);
        return;
      }
      const id = Number(idStr);
      const p = portfoliosQuery.data?.find((x) => x.id === id);
      if (!p) return;
      try {
        const parsed = JSON.parse(p.legs);
        if (Array.isArray(parsed)) {
          setCurrentPortfolioId(id);
          setLegs(parsed);
        }
      } catch {
        toast({ description: "这份持仓数据解析失败，可能已损坏。", variant: "destructive" });
      }
    },
    [portfoliosQuery.data, toast],
  );

  const addLeg = useCallback(
    (K: number, type: "call" | "put", side: "long" | "short", qty: number) => {
      setLegs((prev) => [...prev, { type, side, K, qty }]);
      toast({ description: `已加入 ${side === "long" ? "买入" : "卖出"} ${type === "call" ? "Call" : "Put"} K=${K}，别忘了点「保存持仓」。` });
    },
    [toast],
  );

  const openSaveDialog = () => {
    const existing = portfoliosQuery.data?.find((p) => p.id === currentPortfolioId);
    setSaveName(existing?.name ?? "");
    setSaveMemo(existing?.memo ?? "");
    setSaveDialogOpen(true);
  };

  const doSavePortfolio = async () => {
    if (!saveName.trim()) {
      toast({ description: "给持仓起个名字吧。", variant: "destructive" });
      return;
    }
    try {
      const res = await apiRequest("POST", "/api/portfolios", {
        symbol,
        name: saveName.trim(),
        legs: JSON.stringify(legs),
        memo: saveMemo.trim() || null,
        createdAt: Date.now(),
      });
      const created: Portfolio = await res.json();
      setCurrentPortfolioId(created.id);
      setSaveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios", symbol] });
      toast({ description: `持仓「${created.name}」已保存。` });
    } catch (err: any) {
      toast({ description: `保存失败：${err?.message ?? "未知错误"}`, variant: "destructive" });
    }
  };

  const builderHref = legs.length ? `/builder/legs/${encodeLegs(legs)}` : "/builder";
  const stressHref = legs.length ? `/stress/legs/${encodeLegs(legs)}` : "/stress";
  const rollHref = legs.length ? `/roll/legs/${encodeLegs(legs)}` : "/roll";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Table2 className="h-3.5 w-3.5" /> Phase 7a · Option Chain Board
      </div>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="chain-title">
        期权链看板
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        真实 Yahoo Finance 数据，strike × expiry 矩阵一次看全。点任意一格加腿，右上角一键把当前持仓丢进编辑器。
      </p>

      {/* Topbar */}
      <Card className="mt-6 border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-muted-foreground">CURRENT</span>
            <Select value={currentPortfolioId ? String(currentPortfolioId) : "__none__"} onValueChange={handleSelectPortfolio}>
              <SelectTrigger className="h-8 w-[220px] text-xs" data-testid="select-portfolio">
                <SelectValue placeholder="未选择持仓" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">
                  空白 · 未选择持仓
                </SelectItem>
                {(portfoliosQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="gap-1.5 border-border" onClick={openSaveDialog} data-testid="button-save-portfolio">
              <Save className="h-3.5 w-3.5" /> Save Portfolio
            </Button>
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="beginner-mode" className="cursor-pointer text-xs font-medium">
                新手模式
              </Label>
              <Switch
                id="beginner-mode"
                checked={beginnerMode}
                onCheckedChange={setBeginnerMode}
                data-testid="switch-beginner-mode"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground" data-testid="tooltip-beginner-mode">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs">
                  只看最相关的 10 格，别被 500 个数字压垮。
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link href={stressHref} className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--pnl-negative))] hover:underline" data-testid="link-open-stress">
              送到压力测试 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href={builderHref} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-testid="link-open-builder">
              在编辑器打开当前持仓 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href={rollHref} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-testid="link-open-roll">
              送到移仓（作为 base） <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => handleSelectTicker(t)}
              className={
                "rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition-colors " +
                (symbol === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
              data-testid={`button-ticker-${t}`}
            >
              {t}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 font-mono text-sm">
            {chainQuery.isLoading ? (
              <Skeleton className="h-5 w-28" />
            ) : chainQuery.isError ? (
              <span className="text-[hsl(0_70%_65%)]">读取现价失败</span>
            ) : (
              <>
                <span data-testid={`text-price-${symbol}`}>spot: ${fmt(chainQuery.data?.spot, 2)}</span>
                <span
                  className={
                    (chainQuery.data?.changePercent ?? 0) >= 0
                      ? "text-[hsl(var(--pnl-positive))]"
                      : "text-[hsl(0_70%_65%)]"
                  }
                  data-testid={`text-change-${symbol}`}
                >
                  ({(chainQuery.data?.changePercent ?? 0) >= 0 ? "+" : ""}
                  {fmt(chainQuery.data?.changePercent, 2)}%)
                </span>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Portfolio Greeks Cash row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <GreekCashCard label="SPOT POS" value={`${spotShares.toLocaleString()} sh`} color="var(--foreground)" testid="kpi-spotpos" />
        <GreekCashCard label="DELTA CASH" value={fmtMoney(dCash)} color="var(--greek-delta)" testid="kpi-deltacash" />
        <GreekCashCard label="THETA CASH" value={fmtMoney(tCash)} color="var(--greek-theta)" testid="kpi-thetacash" negative={tCash < 0} />
        <GreekCashCard label="1% GAMMA CASH" value={fmtMoney(gCash)} color="var(--greek-gamma)" testid="kpi-gammacash" />
        <GreekCashCard label="VEGA" value={fmt(vSum, 2)} color="var(--greek-vega)" testid="kpi-vega" />
      </div>

      {/* Chain table */}
      <Card className="mt-4 border-border bg-card p-0">
        {chainQuery.isLoading ? (
          <div className="space-y-2 p-4" data-testid="chain-loading">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : chainQuery.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center" data-testid="chain-error">
            <AlertTriangle className="h-8 w-8 text-[hsl(0_70%_65%)]" />
            <p className="max-w-md text-sm text-muted-foreground">
              没读到 {symbol} 的期权链——数据源可能限流了，或者这个标的暂时没有 1-90 天内的到期日。
              <br />
              {(chainQuery.error as Error)?.message}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5 border-border" onClick={() => chainQuery.refetch()} data-testid="button-retry">
              <RefreshCw className="h-3.5 w-3.5" /> 重试
            </Button>
          </div>
        ) : chainQuery.data ? (
          <ChainTable
            snapshot={chainQuery.data}
            legs={legs}
            onAddLeg={addLeg}
            beginnerMode={beginnerMode}
          />
        ) : null}
      </Card>

      {/* Save Portfolio dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent data-testid="dialog-save-portfolio">
          <DialogHeader>
            <DialogTitle>保存持仓快照</DialogTitle>
            <DialogDescription>给这份 {symbol} 持仓起个名字，方便以后在下拉里找回来。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">名称</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="例如：移仓后"
                className="mt-1 h-9 text-sm"
                data-testid="input-portfolio-name"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">备注（可选）</Label>
              <Input
                value={saveMemo}
                onChange={(e) => setSaveMemo(e.target.value)}
                placeholder="例如：Short Gamma 待移仓"
                className="mt-1 h-9 text-sm"
                data-testid="input-portfolio-memo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setSaveDialogOpen(false)} data-testid="button-cancel-save">
              取消
            </Button>
            <Button onClick={doSavePortfolio} data-testid="button-confirm-save">
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GreekCashCard({
  label,
  value,
  color,
  testid,
  negative,
}: {
  label: string;
  value: string;
  color: string;
  testid: string;
  negative?: boolean;
}) {
  return (
    <Card className="border-border bg-card p-3" data-testid={testid}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={"mt-1 truncate font-mono text-sm font-semibold " + (negative ? "text-[hsl(0_70%_65%)]" : "")}
        style={negative ? undefined : { color: `hsl(${color})` }}
      >
        {value}
      </div>
    </Card>
  );
}

function ChainTable({
  snapshot,
  legs,
  onAddLeg,
  beginnerMode,
}: {
  snapshot: ChainSnapshot;
  legs: Leg[];
  onAddLeg: (K: number, type: "call" | "put", side: "long" | "short", qty: number) => void;
  beginnerMode: boolean;
}) {
  // Beginner mode: show only the first 2 expiries (nearest-dated) to cut noise.
  const expiries = beginnerMode ? snapshot.expiries.slice(0, 2) : snapshot.expiries;
  return (
    <div className="overflow-x-auto" data-testid="chain-table-wrap">
      <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-card px-2 py-2 text-left font-mono text-[10px] text-muted-foreground">
              STRIKE
            </th>
            {expiries.map((exp, ei) => (
              <th
                key={exp.date}
                colSpan={16}
                className={
                  "border-b border-l border-border px-2 py-2 text-center font-mono text-[10px] text-muted-foreground " +
                  (ei % 2 === 1 ? "bg-[hsl(210_40%_8%)]" : "")
                }
                data-testid={`expiry-header-${exp.date}`}
              >
                {exp.date} · DTE {exp.dte}
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-card px-2 py-1" />
            {expiries.map((exp, ei) => (
              <SubHeaders key={exp.date} tint={ei % 2 === 1} />
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            // union of all strikes across (possibly filtered) expiries, sorted, for stable row set
            const strikeSet = new Set<number>();
            expiries.forEach((exp) => exp.strikes.forEach((s) => strikeSet.add(s.K)));
            let strikes = Array.from(strikeSet).sort((a, b) => a - b);

            // Beginner mode: keep only ATM ±2 strikes (5 rows × 2 expiries ≈ 10 relevant cells).
            if (beginnerMode && strikes.length > 5) {
              let atmIdx = 0;
              let best = Infinity;
              strikes.forEach((K, i) => {
                const d = Math.abs(K - snapshot.spot);
                if (d < best) {
                  best = d;
                  atmIdx = i;
                }
              });
              const lo = Math.max(0, atmIdx - 2);
              const hi = Math.min(strikes.length, atmIdx + 3);
              strikes = strikes.slice(lo, hi);
            }

            return strikes.map((K) => {
              const netQty = netQtyAtStrike(legs, K);
              const isAtm = Math.abs(K - snapshot.spot) < (snapshot.spot * 0.005);
              return (
                <tr key={K} className="group hover:bg-muted/20" data-testid={`row-strike-${K}`}>
                  <td className="sticky left-0 z-10 border-b border-border bg-card px-2 py-1 font-mono text-xs font-semibold group-hover:bg-muted/20">
                    <div className="flex items-center gap-1.5">
                      {netQty !== 0 && (
                        <span
                          className={
                            "rounded px-1 font-mono text-[9px] font-bold " +
                            (netQty > 0
                              ? "bg-[hsl(var(--pnl-positive)/0.15)] text-[hsl(var(--pnl-positive))]"
                              : "bg-[hsl(0_70%_65%/0.15)] text-[hsl(0_70%_65%)]")
                          }
                          data-testid={`gutter-${K}`}
                        >
                          {netQty > 0 ? "+" : ""}
                          {netQty}
                        </span>
                      )}
                      <span className={isAtm ? "text-primary" : undefined}>{fmt(K, K < 10 ? 2 : 1)}</span>
                    </div>
                  </td>
                  {expiries.map((exp, ei) => {
                    const row = exp.strikes.find((s) => s.K === K);
                    return (
                      <ExpiryCells
                        key={exp.date}
                        strike={K}
                        row={row}
                        dte={exp.dte}
                        tint={ei % 2 === 1}
                        onAddLeg={onAddLeg}
                      />
                    );
                  })}
                </tr>
              );
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}

const SUB_COLS = ["BID", "MODEL", "ASK", "$GAMMA", "$DELTA", "IV", "APR", "THETA"];

function SubHeaders({ tint }: { tint: boolean }) {
  return (
    <>
      {/* Call side */}
      {SUB_COLS.map((c) => (
        <th
          key={`call-${c}`}
          className={"border-b border-l border-border px-1.5 py-1 text-right font-mono text-[9px] text-muted-foreground " + (tint ? "bg-[hsl(210_40%_8%)]" : "")}
        >
          {c}
        </th>
      ))}
      {/* Put side (mirrored) */}
      {SUB_COLS.map((c) => (
        <th
          key={`put-${c}`}
          className={"border-b border-l border-border px-1.5 py-1 text-right font-mono text-[9px] text-muted-foreground " + (tint ? "bg-[hsl(210_40%_8%)]" : "")}
        >
          {c}
        </th>
      ))}
    </>
  );
}

function ExpiryCells({
  strike,
  row,
  dte,
  tint,
  onAddLeg,
}: {
  strike: number;
  row: StrikeRow | undefined;
  dte: number;
  tint: boolean;
  onAddLeg: (K: number, type: "call" | "put", side: "long" | "short", qty: number) => void;
}) {
  const tintClass = tint ? "bg-[hsl(210_40%_8%)]" : "";
  if (!row) {
    return (
      <>
        {Array.from({ length: 16 }).map((_, i) => (
          <td key={i} className={`border-b border-l border-border px-1.5 py-1 text-right font-mono text-[10px] text-muted-foreground/40 ${tintClass}`}>
            —
          </td>
        ))}
      </>
    );
  }
  return (
    <>
      <OptionCellGroup type="call" strike={strike} opt={row.call} dte={dte} tint={tint} onAddLeg={onAddLeg} />
      <OptionCellGroup type="put" strike={strike} opt={row.put} dte={dte} tint={tint} onAddLeg={onAddLeg} />
    </>
  );
}

function OptionCellGroup({
  type,
  strike,
  opt,
  tint,
  onAddLeg,
}: {
  type: "call" | "put";
  strike: number;
  opt: OptionRow;
  dte: number;
  tint: boolean;
  onAddLeg: (K: number, type: "call" | "put", side: "long" | "short", qty: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"long" | "short">("long");
  const [qty, setQty] = useState(1);
  const tintClass = tint ? "bg-[hsl(210_40%_8%)]" : "";

  const dollarGamma = opt.gamma !== null ? opt.gamma * 100 : null;
  const dollarDelta = opt.delta !== null ? opt.delta * 100 : null;
  const aprBg = aprBackground(opt.apr);
  const thetaClass = (opt.theta ?? 0) < 0 ? "text-[hsl(0_70%_65%)]" : "";

  const cellBase = `border-b border-l border-border px-1.5 py-1 text-right font-mono text-[10px] cursor-pointer hover:brightness-125 ${tintClass}`;
  const testidPrefix = `cell-${type}-${strike}`;

  const handleAdd = () => {
    onAddLeg(strike, type, side, Math.max(1, Math.round(qty)));
    setOpen(false);
  };

  const cells: { label: string; value: string; testid: string; style?: React.CSSProperties; extraClass?: string }[] = [
    { label: "BID", value: fmt(opt.bid), testid: "bid" },
    { label: "MODEL", value: fmt(opt.model), testid: "model" },
    { label: "ASK", value: fmt(opt.ask), testid: "ask" },
    { label: "$GAMMA", value: fmt(dollarGamma, 3), testid: "gamma" },
    { label: "$DELTA", value: fmt(dollarDelta, 1), testid: "delta" },
    { label: "IV", value: opt.iv !== null ? `${fmt(opt.iv * 100, 1)}%` : "—", testid: "iv" },
    { label: "APR", value: opt.apr !== null ? `${fmt(opt.apr, 1)}%` : "—", testid: "apr", style: { background: aprBg }, extraClass: "text-white/90" },
    { label: "THETA", value: fmt(opt.theta, 3), testid: "theta", extraClass: thetaClass },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {cells.map((c) => (
        <PopoverTrigger asChild key={c.testid}>
          <td
            className={`${cellBase} ${c.extraClass ?? ""}`}
            style={c.style}
            data-testid={`${testidPrefix}-${c.testid}`}
            onClick={() => setOpen(true)}
          >
            {c.value}
          </td>
        </PopoverTrigger>
      ))}
      <PopoverContent className="w-64" data-testid={`popover-add-leg-${type}-${strike}`}>
        <div className="mb-2 font-mono text-xs font-semibold">
          {type === "call" ? "Call" : "Put"} K={strike}
        </div>
        <div className="space-y-3">
          <RadioGroup value={side} onValueChange={(v) => setSide(v as "long" | "short")} className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs">
              <RadioGroupItem value="long" data-testid={`radio-long-${type}-${strike}`} /> Long
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <RadioGroupItem value="short" data-testid={`radio-short-${type}-${strike}`} /> Short
            </label>
          </RadioGroup>
          <div>
            <Label className="text-[10px] text-muted-foreground">数量</Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="mt-1 h-8 text-xs"
              data-testid={`input-qty-${type}-${strike}`}
            />
          </div>
          <Button size="sm" className="w-full" onClick={handleAdd} data-testid={`button-add-leg-strike-${strike}-${type}`}>
            Add leg
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
