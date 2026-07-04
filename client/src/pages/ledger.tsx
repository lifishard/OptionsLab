import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bookmark,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  SlidersHorizontal,
  Flame,
  Target,
  ShieldAlert,
  Layers,
} from "lucide-react";
import type { Portfolio } from "@shared/schema";
import type { Leg } from "@/lib/strategies/definitions";

// base64(JSON) — same scheme builder.tsx / chain.tsx / copilot.tsx use.
function encodeLegs(legs: Leg[]): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(legs))));
  } catch {
    return "";
  }
}

function parseLegs(raw: string): Leg[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Leg[]) : [];
  } catch {
    return [];
  }
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}$${abs}`;
}

function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "持仓中", cls: "border-[hsl(var(--pnl-positive))] text-[hsl(var(--pnl-positive))]" },
  closed: { label: "已平仓", cls: "border-border text-muted-foreground" },
  rolled: { label: "已移仓", cls: "border-primary text-primary" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "border-border text-muted-foreground" };
  return (
    <Badge variant="outline" className={"font-mono text-[10px] " + meta.cls} data-testid={`status-${status}`}>
      {meta.label}
    </Badge>
  );
}

function legSummary(legs: Leg[]): string {
  if (!legs.length) return "空仓 · 无腿";
  return legs
    .map((l) => {
      const sideZh = l.side === "long" ? "买" : "卖";
      if (l.type === "stock") return `${sideZh}股 ×${l.qty}`;
      const typeZh = l.type === "call" ? "C" : "P";
      return `${sideZh}${typeZh}${l.K ?? "?"}×${l.qty}`;
    })
    .join(" · ");
}

export default function Ledger() {
  const [isDetail, params] = useRoute("/ledger/:id");
  const detailId = isDetail && params ? Number(params.id) : null;

  const listQuery = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios/all"],
  });

  const sorted = useMemo(() => {
    const list = listQuery.data ?? [];
    return [...list].sort((a, b) => (b.openedAt ?? b.createdAt) - (a.openedAt ?? a.createdAt));
  }, [listQuery.data]);

  const detail = useMemo(
    () => (detailId !== null ? sorted.find((p) => p.id === detailId) ?? null : null),
    [detailId, sorted],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Bookmark className="h-3.5 w-3.5" /> Phase 7b · Portfolio Ledger
      </div>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="ledger-title">
        持仓台账
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        老欧说：「别拍脑袋开仓，开之前先想清楚三件事。」这里把你存下的每份组合连同开仓逻辑（看涨看跌、目标、止损）一起归档，一眼看完所有开过的仓。
      </p>

      {/* Body */}
      {listQuery.isLoading ? (
        <div className="mt-6 space-y-3" data-testid="ledger-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : listQuery.isError ? (
        <Card className="mt-6 flex flex-col items-center gap-3 border-border bg-card p-10 text-center" data-testid="ledger-error">
          <AlertTriangle className="h-8 w-8 text-[hsl(0_70%_65%)]" />
          <p className="max-w-md text-sm text-muted-foreground">
            读取持仓台账失败。{(listQuery.error as Error)?.message}
          </p>
          <Button size="sm" variant="outline" className="border-border" onClick={() => listQuery.refetch()} data-testid="button-retry-ledger">
            重试
          </Button>
        </Card>
      ) : detail ? (
        <LedgerDetail portfolio={detail} />
      ) : detailId !== null ? (
        <Card className="mt-6 flex flex-col items-center gap-3 border-border bg-card p-10 text-center" data-testid="ledger-notfound">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">没找到这份持仓（id={detailId}），可能已经被删了。</p>
          <Link href="/ledger">
            <Button size="sm" variant="outline" className="border-border" data-testid="button-back-list">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> 返回列表
            </Button>
          </Link>
        </Card>
      ) : sorted.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-4 border-dashed border-border bg-card p-12 text-center" data-testid="ledger-empty">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted">
            <Bookmark className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">台账还是空的</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
              去期权链看板或组合编辑器搭一份仓位，点「保存持仓」，它就会出现在这里。
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/chain">
              <Button size="sm" className="gap-1.5" data-testid="button-goto-chain">
                打开期权链 <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href="/copilot">
              <Button size="sm" variant="outline" className="gap-1.5 border-border" data-testid="button-goto-copilot">
                问问决策副驾
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="mt-6 space-y-3" data-testid="ledger-list">
          {sorted.map((p) => {
            const legs = parseLegs(p.legs);
            return (
              <Link key={p.id} href={`/ledger/${p.id}`}>
                <Card
                  className="group cursor-pointer border-border bg-card p-4 transition-colors hover-elevate"
                  data-testid={`card-portfolio-${p.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">{p.symbol}</span>
                        <span className="truncate text-sm font-semibold" data-testid={`text-portfolio-name-${p.id}`}>
                          {p.name}
                        </span>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">{legSummary(legs)}</p>
                      {p.thesis ? (
                        <p className="mt-1.5 line-clamp-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                          {p.thesis}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[13px] italic text-muted-foreground/60">（没写开仓逻辑——下次记得先想清楚为什么开）</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                      <div>开仓 {fmtDate(p.openedAt ?? p.createdAt)}</div>
                      <div className="mt-0.5">{legs.length} 腿</div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LedgerDetail({ portfolio }: { portfolio: Portfolio }) {
  const legs = parseLegs(portfolio.legs);
  const encoded = encodeLegs(legs);

  return (
    <div className="mt-6" data-testid={`ledger-detail-${portfolio.id}`}>
      <Link href="/ledger">
        <Button size="sm" variant="ghost" className="mb-3 gap-1.5 px-2 text-muted-foreground" data-testid="button-back-list">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回台账
        </Button>
      </Link>

      <Card className="border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-primary">{portfolio.symbol}</span>
              <h2 className="text-lg font-semibold" data-testid="text-detail-name">
                {portfolio.name}
              </h2>
              <StatusBadge status={portfolio.status} />
            </div>
            {portfolio.memo ? (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">{portfolio.memo}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Link href={legs.length ? `/builder/legs/${encoded}` : "/builder"}>
              <Button size="sm" className="gap-1.5" data-testid="button-open-builder">
                <SlidersHorizontal className="h-3.5 w-3.5" /> 编辑器打开
              </Button>
            </Link>
            <Link href={legs.length ? `/stress/legs/${encoded}` : "/stress"}>
              <Button size="sm" variant="outline" className="gap-1.5 border-border" data-testid="button-open-stress">
                <Flame className="h-3.5 w-3.5" /> 压力测试
              </Button>
            </Link>
          </div>
        </div>

        {/* Thesis */}
        <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">开仓逻辑 · Thesis</div>
          {portfolio.thesis ? (
            <p className="text-sm leading-relaxed" data-testid="text-detail-thesis">
              {portfolio.thesis}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground/60" data-testid="text-detail-thesis-empty">
              这份仓没写开仓逻辑。老欧的规矩：开之前先想清楚——涨还是跌？多久？亏多少能睡着？
            </p>
          )}
        </div>

        {/* Meta grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetaCell label="开仓时间" value={fmtDate(portfolio.openedAt ?? portfolio.createdAt)} Icon={Bookmark} />
          <MetaCell label="开仓现价" value={portfolio.openedSpot != null ? `$${portfolio.openedSpot.toFixed(2)}` : "—"} Icon={Layers} />
          <MetaCell label="止盈目标" value={fmtMoney(portfolio.targetPnL)} Icon={Target} accent="text-[hsl(var(--pnl-positive))]" />
          <MetaCell label="止损红线" value={fmtMoney(portfolio.stopLoss)} Icon={ShieldAlert} accent="text-[hsl(0_70%_65%)]" />
        </div>

        {/* Legs */}
        <div className="mt-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            持仓明细 · {legs.length} 腿
          </div>
          {legs.length === 0 ? (
            <p className="text-sm text-muted-foreground">空仓——没有任何腿。</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 font-mono text-[10px] uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">方向</th>
                    <th className="px-3 py-2 text-left">类型</th>
                    <th className="px-3 py-2 text-right">行权价</th>
                    <th className="px-3 py-2 text-right">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map((l, i) => (
                    <tr key={i} className="border-b border-border last:border-0" data-testid={`row-leg-${i}`}>
                      <td className="px-3 py-2">
                        <span className={l.side === "long" ? "text-[hsl(var(--pnl-positive))]" : "text-[hsl(0_70%_65%)]"}>
                          {l.side === "long" ? "买入 Long" : "卖出 Short"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {l.type === "call" ? "Call" : l.type === "put" ? "Put" : "Stock"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{l.K != null ? l.K : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{l.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-5 font-mono text-[11px] text-muted-foreground/60">
          完整的台账编辑（改止盈止损、记录快照、平仓归档）在 Phase 9 上线。当前版本先把「为什么开」这件事记牢。
        </p>
      </Card>
    </div>
  );
}

function MetaCell({
  label,
  value,
  Icon,
  accent,
}: {
  label: string;
  value: string;
  Icon: any;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={"mt-1 font-mono text-sm font-semibold " + (accent ?? "")}>{value}</div>
    </div>
  );
}
