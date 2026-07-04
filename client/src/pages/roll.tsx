// ── Phase 8 · 移仓引擎 (Roll Position Engine) ──
// 核心概念：新持仓 = 旧持仓 △ 移仓单（集合运算）。
// 载入一份 base 持仓 → 编辑出 target → 引擎算出「关 / 开 / 保留」三张单，
// 并用 EXISTING BSM 引擎（scenario engine + payoff）重算 before/after 的四联指标。
// Apply Diff 弹窗把这次移仓的取舍摆在眼前，老欧一句大白话说清换来了什么。
//
// Karpathy rules: Read Before Writing（复用 leg-editor / diff.ts / scenario engine）、
// Surgical Changes（新文件，纯展示 + 现有 API）、Simplicity First、Fail Loudly。
// NO localStorage（iframe 会崩）。深链走 wouter path param /roll/legs/:encoded。

import { useMemo, useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LegEditor } from "@/components/leg-editor";
import {
  Repeat,
  Plus,
  RotateCcw,
  ArrowRight,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Quote,
} from "lucide-react";
import type { Leg } from "@/lib/strategies/definitions";
import { STRATEGIES, STRATEGY_ORDER } from "@/lib/strategies/definitions";
import type { Portfolio } from "@shared/schema";
import { computeDiff, computeRollImpact, type RollImpact } from "@/lib/roll/diff";

const R = 0.045;

// ── deep-link codec (identical scheme to builder / chain / stress) ──
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

const clone = (legs: Leg[]): Leg[] => legs.map((l) => ({ ...l }));

function fmtMoney(n: number | null | undefined, d = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${n < 0 ? "-" : ""}$${abs}`;
}
function fmtPct(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${n.toFixed(d)}%`;
}
function fmtBE(arr: number[]): string {
  if (!arr || arr.length === 0) return "—";
  return arr.map((x) => x.toFixed(1)).join(" / ");
}
function legLabel(leg: Leg): string {
  if (leg.type === "stock") return `${leg.side === "long" ? "买入" : "卖出"} 股票 ×${leg.qty}`;
  const t = leg.type === "call" ? "Call" : "Put";
  const off = leg.dteOffset ? ` +${leg.dteOffset}d` : "";
  return `${leg.side === "long" ? "买" : "卖"} ${t} K${leg.K}${off} ×${leg.qty}`;
}

export default function Roll() {
  const { toast } = useToast();

  // ── deep-link: /roll/legs/:encoded pre-loads the base ──
  const [matchDeep, deepParams] = useRoute("/roll/legs/:encoded");

  // base = 旧持仓 (read-only), target = 目标持仓 (editable)
  const [base, setBase] = useState<Leg[]>([]);
  const [target, setTarget] = useState<Leg[]>([]);
  const [baseSymbol, setBaseSymbol] = useState<string>("");
  const [baseName, setBaseName] = useState<string>("");
  const [baseId, setBaseId] = useState<number | null>(null);
  const [loadedSel, setLoadedSel] = useState<string>("");

  // list every saved portfolio across symbols (Phase 7b endpoint)
  const portfoliosQuery = useQuery<Portfolio[]>({ queryKey: ["/api/portfolios/all"] });

  // spot for pricing — pull the live chain quote for the base symbol (fallback 100)
  const chainQuery = useQuery<{ symbol: string; spot: number }>({
    queryKey: ["/api/chain", baseSymbol],
    enabled: !!baseSymbol,
  });
  const spot = chainQuery.data?.spot ?? 100;

  // hydrate base from a deep link once
  useEffect(() => {
    if (matchDeep && deepParams?.encoded) {
      const decoded = decodeLegs(deepParams.encoded);
      if (decoded && decoded.length) {
        setBase(decoded);
        setTarget(clone(decoded));
        setBaseName("深链载入");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchDeep, deepParams?.encoded]);

  const loadBase = (legs: Leg[], symbol: string, name: string, id: number | null) => {
    setBase(clone(legs));
    setTarget(clone(legs));
    setBaseSymbol(symbol);
    setBaseName(name);
    setBaseId(id);
  };

  const onSelectPortfolio = (idStr: string) => {
    setLoadedSel(idStr);
    const p = portfoliosQuery.data?.find((x) => String(x.id) === idStr);
    if (!p) return;
    let legs: Leg[] = [];
    try {
      legs = JSON.parse(p.legs) as Leg[];
    } catch {
      legs = [];
    }
    loadBase(legs, p.symbol, p.name, p.id);
  };

  // target editing
  const patchTarget = (i: number, patch: Partial<Leg>) =>
    setTarget((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeTarget = (i: number) => setTarget((prev) => prev.filter((_, idx) => idx !== i));
  const addTargetLeg = () =>
    setTarget((prev) => [...prev, { type: "call", side: "short", K: Math.round(spot) || 100, qty: 1 }]);
  const resetTargetToBase = () => setTarget(clone(base));
  const loadTemplateIntoTarget = (slug: string) => {
    const def = STRATEGIES[slug];
    if (!def) return;
    setTarget(def.legs.map((l) => ({ ...l })));
  };

  const hasBase = base.length > 0;

  // ── the set-operation diff + before/after impact ──
  const diff = useMemo(() => {
    if (!hasBase && target.length === 0) return null;
    try {
      return computeDiff(base, target);
    } catch {
      return null;
    }
  }, [base, target, hasBase]);

  const impact = useMemo<RollImpact | null>(() => {
    if (!hasBase && target.length === 0) return null;
    try {
      return computeRollImpact(base, target, spot, R);
    } catch {
      return null;
    }
  }, [base, target, spot, hasBase]);

  // 老欧解读：把这次移仓换来了什么翻译成大白话
  const laoou = useMemo(() => {
    if (!impact || !diff) return [];
    const lines: string[] = [];
    const dDelta = impact.deltaCashAfter - impact.deltaCashBefore;
    if (Math.abs(dDelta) > 1) {
      lines.push(
        dDelta > 0
          ? `方向敞口往上加了 ${fmtMoney(dDelta)}——你在赌它继续涨。`
          : `方向敞口往下压了 ${fmtMoney(Math.abs(dDelta))}——你在把多头收一收。`,
      );
    } else {
      lines.push("方向敞口基本没动——这次移的是时间和赔率，不是方向。");
    }
    if (impact.netCashFlow > 1) {
      lines.push(`这一手净收了 ${fmtMoney(impact.netCashFlow)} 权利金——先把钱落袋。`);
    } else if (impact.netCashFlow < -1) {
      lines.push(`这一手净付了 ${fmtMoney(Math.abs(impact.netCashFlow))}——花钱买了新的赔率。`);
    } else {
      lines.push("权利金几乎打平——纯换结构，不涉及现金。");
    }
    if (impact.aprBefore != null && impact.aprAfter != null) {
      const d = impact.aprAfter - impact.aprBefore;
      if (Math.abs(d) > 0.5) {
        lines.push(
          d > 0
            ? `年化收租从 ${fmtPct(impact.aprBefore)} 提到 ${fmtPct(impact.aprAfter)}——收得更凶了，风险也更贴身。`
            : `年化收租从 ${fmtPct(impact.aprBefore)} 降到 ${fmtPct(impact.aprAfter)}——让出一点收益，换点安全垫。`,
        );
      }
    }
    const closeN = diff.closes.length;
    const openN = diff.opens.length;
    if (closeN || openN) {
      lines.push(`动作：关 ${closeN} 条腿、开 ${openN} 条腿、留 ${diff.unchanged.length} 条不动。`);
    }
    lines.push("移仓不是修补，是重新下一次判断——每一次 diff，都是和市场先生的一次对话。");
    return lines;
  }, [impact, diff]);

  // ── Apply Diff dialog + save ──
  const [applyOpen, setApplyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMemo, setSaveMemo] = useState("");

  const openApply = () => {
    setSaveName(baseName ? `${baseName} · 移仓后` : "移仓后");
    setSaveMemo("");
    setApplyOpen(true);
  };

  const doSave = async (overwrite: boolean) => {
    if (!saveName.trim() && !overwrite) {
      toast({ description: "给新持仓起个名字吧。", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (overwrite && baseId != null) {
        await apiRequest("PATCH", `/api/portfolios/${baseId}`, {
          name: saveName.trim() || baseName || "移仓后",
          status: "rolled",
        });
        // overwrite legs by creating the rolled version under same name; PATCH schema
        // doesn't carry legs, so we also persist the new leg set as a fresh row and
        // mark the old one "rolled" (never destroy history — 老欧: 留痕).
        await apiRequest("POST", "/api/portfolios", {
          symbol: baseSymbol || "—",
          name: saveName.trim() || baseName || "移仓后",
          legs: JSON.stringify(target),
          memo: saveMemo.trim() || "覆盖移仓（旧仓已标记 rolled）",
        });
        toast({ description: "已覆盖：旧仓标记为 rolled，新仓已保存。" });
      } else {
        await apiRequest("POST", "/api/portfolios", {
          symbol: baseSymbol || "—",
          name: saveName.trim(),
          legs: JSON.stringify(target),
          memo: saveMemo.trim() || null,
        });
        toast({ description: `已存为新持仓「${saveName.trim()}」。` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios/all"] });
      setApplyOpen(false);
    } catch (err: any) {
      toast({ description: `保存失败：${err?.message ?? "未知错误"}`, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const stressHref = target.length ? `/stress/legs/${encodeLegs(target)}` : "/stress";
  const options = portfoliosQuery.data ?? [];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      {/* ── Topbar ── */}
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Repeat className="h-3.5 w-3.5" /> Phase 8 · Roll Position Engine
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="roll-title">
            移仓引擎
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            新持仓 = 旧持仓 <span className="font-mono text-primary">△</span> 移仓单。载入 base，编出 target，看清关了什么、开了什么。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={loadedSel} onValueChange={onSelectPortfolio}>
            <SelectTrigger className="h-9 w-56 border-border text-sm" data-testid="select-load-base">
              <SelectValue placeholder="载入 base 持仓…" />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  还没有保存的持仓
                </SelectItem>
              ) : (
                options.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} data-testid={`option-portfolio-${p.id}`}>
                    {p.symbol} · {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Link href={stressHref}>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border"
              disabled={!target.length}
              data-testid="button-to-stress"
            >
              <Flame className="h-3.5 w-3.5" /> 送到压测
            </Button>
          </Link>
        </div>
      </div>

      {!hasBase ? (
        // ── empty state ──
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed border-border bg-card/40 p-16 text-center" data-testid="roll-empty">
          <Repeat className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">先载入一份 base 持仓，才能开始移仓。</p>
          <p className="max-w-md text-xs text-muted-foreground/70">
            从右上角下拉里选一份保存过的持仓，或者从期权链 / 组合编辑器点「送到移仓」带过来。
          </p>
          {portfoliosQuery.isLoading && <Skeleton className="mt-2 h-8 w-48" />}
        </Card>
      ) : (
        <div className="space-y-5">
          {/* ── Base | Target panels ── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* BASE (read-only) */}
            <Card className="border-border bg-card p-4" data-testid="panel-base">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Base · 旧持仓</div>
                  <div className="text-sm font-semibold" data-testid="text-base-name">
                    {baseSymbol && <span className="text-primary">{baseSymbol}</span>} {baseName}
                  </div>
                </div>
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {base.length} 条腿
                </span>
              </div>
              <div className="space-y-2">
                {base.map((leg, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-xs"
                    data-testid={`base-leg-${i}`}
                  >
                    <span>{legLabel(leg)}</span>
                    <span
                      className="text-[10px] uppercase"
                      style={{ color: leg.side === "long" ? "hsl(var(--pnl-positive))" : "hsl(var(--pnl-negative))" }}
                    >
                      {leg.side}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground/70">Base 只读——想改就改右边的 target，引擎自己算差。</p>
            </Card>

            {/* TARGET (editable) */}
            <Card className="border-border bg-card p-4" data-testid="panel-target">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-primary">Target · 目标持仓</div>
                  <div className="text-sm font-semibold">你想移成什么样</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Select value="" onValueChange={loadTemplateIntoTarget}>
                    <SelectTrigger className="h-8 w-36 border-border text-xs" data-testid="select-target-template">
                      <SelectValue placeholder="套用模板…" />
                    </SelectTrigger>
                    <SelectContent>
                      {STRATEGY_ORDER.map((slug) => {
                        const d = STRATEGIES[slug];
                        if (!d) return null;
                        return (
                          <SelectItem key={slug} value={slug} data-testid={`option-template-${slug}`}>
                            {d.nameZh} · {d.nameEn}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 border-border text-xs"
                    onClick={resetTargetToBase}
                    data-testid="button-reset-target"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> 重置为 Base
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {target.map((leg, i) => (
                  <LegEditor
                    key={i}
                    index={i}
                    leg={leg}
                    onChange={(patch) => patchTarget(i, patch)}
                    onRemove={() => removeTarget(i)}
                    testidPrefix="target-leg"
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-1 border-dashed border-border text-xs"
                onClick={addTargetLeg}
                data-testid="button-add-target-leg"
              >
                <Plus className="h-3.5 w-3.5" /> 加一条腿
              </Button>
            </Card>
          </div>

          {/* ── Roll Preview 4-metric compare bar ── */}
          {impact && (
            <Card className="border-border bg-card p-4" data-testid="panel-compare">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Roll Preview · 移仓前后对比
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <CompareMetric
                  label="Delta Cash"
                  before={fmtMoney(impact.deltaCashBefore)}
                  after={fmtMoney(impact.deltaCashAfter)}
                  delta={impact.deltaCashDelta}
                  deltaFmt={fmtMoney(impact.deltaCashDelta)}
                  testid="metric-delta"
                />
                <CompareMetric
                  label="年化收租 APR"
                  before={fmtPct(impact.aprBefore)}
                  after={fmtPct(impact.aprAfter)}
                  delta={impact.aprAfter != null && impact.aprBefore != null ? impact.aprAfter - impact.aprBefore : 0}
                  deltaFmt={
                    impact.aprAfter != null && impact.aprBefore != null
                      ? fmtPct(impact.aprAfter - impact.aprBefore)
                      : "—"
                  }
                  testid="metric-apr"
                />
                <CompareMetric
                  label="净权利金流"
                  before="—"
                  after={fmtMoney(impact.netCashFlow)}
                  delta={impact.netCashFlow}
                  deltaFmt={impact.netCashFlow >= 0 ? "净入" : "净出"}
                  single
                  testid="metric-netcash"
                />
                <CompareMetric
                  label="盈亏平衡"
                  before={fmtBE(impact.breakEvenBefore)}
                  after={fmtBE(impact.breakEvenAfter)}
                  delta={0}
                  deltaFmt=""
                  neutral
                  testid="metric-breakeven"
                />
              </div>
            </Card>
          )}

          {/* ── Diff Detail + 老欧解读 ── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {diff && (
              <Card className="border-border bg-card p-4 lg:col-span-2" data-testid="panel-diff">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Diff Detail · 移仓单
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <DiffColumn title="关仓 Close" legs={diff.closes} tone="close" testid="diff-closes" />
                  <DiffColumn title="开仓 Open" legs={diff.opens} tone="open" testid="diff-opens" />
                  <DiffColumn title="保留 Keep" legs={diff.unchanged} tone="keep" testid="diff-unchanged" />
                </div>
              </Card>
            )}

            {/* 老欧解读卡 */}
            <Card className="border-border bg-card p-4" data-testid="panel-laoou">
              <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                <Quote className="h-3.5 w-3.5" /> 老欧解读
              </div>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-foreground/90">
                {laoou.map((line, i) => (
                  <li key={i} className="flex gap-2" data-testid={`laoou-line-${i}`}>
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* ── Apply Diff CTA ── */}
          <div className="flex justify-end">
            <Button
              size="lg"
              className="gap-2"
              onClick={openApply}
              disabled={!diff || (diff.closes.length === 0 && diff.opens.length === 0)}
              data-testid="button-apply-diff"
            >
              预览并应用移仓 <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Apply Diff dialog ── */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="dialog-apply-diff">
          <DialogHeader>
            <DialogTitle>
              移仓预览：从「{baseName || "旧持仓"}」到新持仓
            </DialogTitle>
            <DialogDescription>确认这次移仓换来了什么，再决定存新仓还是覆盖旧仓。</DialogDescription>
          </DialogHeader>

          {impact && diff && (
            <div className="space-y-4">
              {/* 4-metric bar (compact) */}
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MiniMetric label="Delta Cash" value={fmtMoney(impact.deltaCashAfter)} sub={`${impact.deltaCashDelta >= 0 ? "+" : ""}${fmtMoney(impact.deltaCashDelta)}`} />
                <MiniMetric label="APR" value={fmtPct(impact.aprAfter)} sub={impact.aprBefore != null ? `was ${fmtPct(impact.aprBefore)}` : ""} />
                <MiniMetric label="净权利金流" value={fmtMoney(impact.netCashFlow)} sub={impact.netCashFlow >= 0 ? "净入" : "净出"} />
                <MiniMetric label="盈亏平衡" value={fmtBE(impact.breakEvenAfter)} sub="" />
              </div>

              {/* diff detail */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <DiffColumn title="关仓 Close" legs={diff.closes} tone="close" testid="dialog-diff-closes" />
                <DiffColumn title="开仓 Open" legs={diff.opens} tone="open" testid="dialog-diff-opens" />
                <DiffColumn title="保留 Keep" legs={diff.unchanged} tone="keep" testid="dialog-diff-unchanged" />
              </div>

              {/* 老欧 card */}
              <div className="rounded-md border border-border bg-background/40 p-3">
                <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                  <Quote className="h-3.5 w-3.5" /> 老欧解读
                </div>
                <ul className="space-y-1.5 text-xs leading-relaxed text-foreground/90">
                  {laoou.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* save inputs */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">新持仓名称</Label>
                  <Input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="例如：移仓后"
                    className="mt-1 h-9 text-sm"
                    data-testid="input-roll-name"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">备注（可选）</Label>
                  <Input
                    value={saveMemo}
                    onChange={(e) => setSaveMemo(e.target.value)}
                    placeholder="例如：把 gamma 收一收"
                    className="mt-1 h-9 text-sm"
                    data-testid="input-roll-memo"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="border-border" onClick={() => setApplyOpen(false)} data-testid="button-cancel-apply">
              取消
            </Button>
            <Button
              variant="outline"
              className="border-border"
              onClick={() => doSave(true)}
              disabled={saving || baseId == null}
              data-testid="button-overwrite-base"
            >
              覆盖 base 持仓
            </Button>
            <Button onClick={() => doSave(false)} disabled={saving} data-testid="button-save-new">
              存为新持仓（不覆盖）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── sub-components ──

function CompareMetric({
  label,
  before,
  after,
  delta,
  deltaFmt,
  single,
  neutral,
  testid,
}: {
  label: string;
  before: string;
  after: string;
  delta: number;
  deltaFmt: string;
  single?: boolean;
  neutral?: boolean;
  testid: string;
}) {
  const up = delta > 0;
  const color = neutral || delta === 0 ? "text-muted-foreground" : up ? "text-[hsl(var(--pnl-positive))]" : "text-[hsl(var(--pnl-negative))]";
  return (
    <div className="rounded-md border border-border bg-background/40 p-3" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {single ? (
        <div className="mt-1.5 font-mono text-lg font-semibold" data-testid={`${testid}-after`}>
          {after}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2 font-mono text-sm">
          <span className="text-muted-foreground" data-testid={`${testid}-before`}>{before}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
          <span className="font-semibold text-foreground" data-testid={`${testid}-after`}>{after}</span>
        </div>
      )}
      {deltaFmt && (
        <div className={`mt-1 flex items-center gap-1 font-mono text-[11px] ${color}`}>
          {!neutral && delta !== 0 && (up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
          {deltaFmt}
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
      {sub && <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function DiffColumn({
  title,
  legs,
  tone,
  testid,
}: {
  title: string;
  legs: Leg[];
  tone: "close" | "open" | "keep";
  testid: string;
}) {
  const cfg = {
    close: { color: "hsl(var(--pnl-negative))", Icon: Minus },
    open: { color: "hsl(var(--pnl-positive))", Icon: Plus },
    keep: { color: "hsl(var(--muted-foreground))", Icon: ArrowRight },
  }[tone];
  const Icon = cfg.Icon;
  return (
    <div className="rounded-md border border-border bg-background/40 p-3" data-testid={testid}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: cfg.color }}>
        <Icon className="h-3.5 w-3.5" /> {title}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{legs.length}</span>
      </div>
      {legs.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground/60">—</p>
      ) : (
        <ul className="space-y-1">
          {legs.map((leg, i) => (
            <li key={i} className="font-mono text-[11px] text-foreground/85" data-testid={`${testid}-item-${i}`}>
              {legLabel(leg)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
