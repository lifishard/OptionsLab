import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  Shield,
  Scale,
  Flame,
  Clock,
  SlidersHorizontal,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import type { Leg } from "@/lib/strategies/definitions";
import {
  recommendStrategies,
  type Direction,
  type Timeframe,
  type RiskAppetite,
  type OptionChainData,
  type Candidate,
} from "@/lib/copilot/rules";
import { TickerSearch } from "@/components/ticker-search";

function encodeLegs(legs: Leg[]): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(legs))));
  } catch {
    return "";
  }
}

function fmtMoney(n: number | null): string {
  if (n === null) return "无限";
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}$${abs}`;
}

const DIRECTION_OPTS: { value: Direction; emoji: string; label: string; Icon: any }[] = [
  { value: "up", emoji: "📈", label: "涨", Icon: TrendingUp },
  { value: "down", emoji: "📉", label: "跌", Icon: TrendingDown },
  { value: "flat", emoji: "➡️", label: "横盘", Icon: Minus },
  { value: "unsure", emoji: "🤷", label: "说不准", Icon: HelpCircle },
];
const TIMEFRAME_OPTS: { value: Timeframe; label: string; sub: string }[] = [
  { value: "week", label: "本周", sub: "0–14 天" },
  { value: "month", label: "本月", sub: "15–45 天" },
  { value: "quarter", label: "下季度", sub: "46–120 天" },
];
const RISK_OPTS: { value: RiskAppetite; label: string; sub: string; Icon: any }[] = [
  { value: "conservative", label: "保守", sub: "只想赚小钱不想爆", Icon: Shield },
  { value: "moderate", label: "中等", sub: "愿意承担适度风险", Icon: Scale },
  { value: "aggressive", label: "激进", sub: "我愿意赌大的", Icon: Flame },
];

export default function Copilot() {
  const [symbol, setSymbol] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe | null>(null);
  const [risk, setRisk] = useState<RiskAppetite | null>(null);

  const chainQuery = useQuery<OptionChainData>({
    queryKey: ["/api/chain", symbol],
    enabled: !!symbol,
  });

  const spot = chainQuery.data?.spot ?? 0;

  // Compute candidates once all three answers + chain are ready.
  const result = useMemo<{ candidates: Candidate[]; error: string | null }>(() => {
    if (step < 4 || !symbol || !direction || !timeframe || !risk) {
      return { candidates: [], error: null };
    }
    if (!chainQuery.data) return { candidates: [], error: null };
    try {
      const candidates = recommendStrategies({
        direction,
        timeframe,
        risk,
        spot: chainQuery.data.spot,
        chain: chainQuery.data,
      });
      return { candidates, error: null };
    } catch (err: any) {
      return { candidates: [], error: err?.message || "算不出候选策略" };
    }
  }, [step, symbol, direction, timeframe, risk, chainQuery.data]);

  const reset = () => {
    setStep(1);
    setSymbol(null);
    setDirection(null);
    setTimeframe(null);
    setRisk(null);
  };

  // Progress dots (steps 1..4, where 4 = results)
  const totalSteps = 4;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Compass className="h-3.5 w-3.5" /> Phase 7b · Decision Copilot
      </div>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="copilot-title">
        决策副驾
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        老欧说：别拍脑袋开仓，开之前先想清楚三件事——涨还是跌？多久？亏多少能睡着？回答完，副驾直接从实时期权链帮你挑好 strike。
      </p>

      {/* Progress dots */}
      <div className="mt-6 flex items-center gap-2" data-testid="copilot-progress">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={
              "h-1.5 flex-1 rounded-full transition-colors " +
              (i < step ? "bg-primary" : "bg-border")
            }
          />
        ))}
      </div>

      <div className="mt-8">
        {/* Step 1 · Symbol */}
        {step === 1 && (
          <StepCard
            title="第一步 · 你想看哪只票？"
            hint="搜索任何美股（AAPL / MSFT / TQQQ…）——标的不是背景板，它本身就是交易的一部分。"
          >
            <TickerSearch
              activeSymbol={symbol}
              onSelect={setSymbol}
              testId="copilot-search"
            />
            {symbol && chainQuery.isError && (
              <div
                className="mt-3 rounded-md border border-[hsl(0_70%_45%)]/40 bg-[hsl(0_70%_45%)]/10 px-3 py-2 font-mono text-xs text-[hsl(0_70%_75%)]"
                data-testid="copilot-chain-error"
              >
                读取 {symbol} 的期权链失败：{(chainQuery.error as Error)?.message || "unknown"}
              </div>
            )}
            <NavButtons
              onNext={() => setStep(2)}
              nextDisabled={!symbol || chainQuery.isLoading || chainQuery.isError || spot <= 0}
            />
          </StepCard>
        )}

        {/* Step 2 · Direction */}
        {step === 2 && (
          <StepCard title="第二步 · 你怎么看它？" hint="方向观点——涨、跌、横盘，还是说不准？">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DIRECTION_OPTS.map((o) => (
                <BigChoice
                  key={o.value}
                  active={direction === o.value}
                  onClick={() => setDirection(o.value)}
                  testid={`button-direction-${o.value}`}
                  emoji={o.emoji}
                  label={o.label}
                />
              ))}
            </div>
            <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!direction} />
          </StepCard>
        )}

        {/* Step 3 · Timeframe + Risk (combined so we hit results after 3 answers) */}
        {step === 3 && (
          <StepCard title="第三步 · 多久？亏多少能睡着？" hint="时间尺度 + 风险胃口，一起答完就出候选。">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> 时间尺度
            </div>
            <div className="grid grid-cols-3 gap-3">
              {TIMEFRAME_OPTS.map((o) => (
                <BigChoice
                  key={o.value}
                  active={timeframe === o.value}
                  onClick={() => setTimeframe(o.value)}
                  testid={`button-timeframe-${o.value}`}
                  label={o.label}
                  sub={o.sub}
                />
              ))}
            </div>
            <div className="mb-2 mt-6 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /> 风险胃口
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {RISK_OPTS.map((o) => (
                <BigChoice
                  key={o.value}
                  active={risk === o.value}
                  onClick={() => setRisk(o.value)}
                  testid={`button-risk-${o.value}`}
                  label={o.label}
                  sub={o.sub}
                />
              ))}
            </div>
            <NavButtons
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
              nextLabel="看候选策略"
              nextDisabled={!timeframe || !risk}
            />
          </StepCard>
        )}

        {/* Step 4 · Results */}
        {step === 4 && (
          <div data-testid="copilot-results">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                <span className="font-mono text-foreground">{symbol}</span> · spot ${spot.toFixed(2)} ·{" "}
                {DIRECTION_OPTS.find((d) => d.value === direction)?.emoji}{" "}
                {DIRECTION_OPTS.find((d) => d.value === direction)?.label} ·{" "}
                {TIMEFRAME_OPTS.find((t) => t.value === timeframe)?.label} ·{" "}
                {RISK_OPTS.find((r) => r.value === risk)?.label}
              </div>
              <Button variant="outline" size="sm" className="border-border gap-1.5" onClick={reset} data-testid="button-restart">
                <ArrowLeft className="h-3.5 w-3.5" /> 重新来
              </Button>
            </div>

            {chainQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
            ) : result.error ? (
              <Card className="flex flex-col items-center gap-3 border-border bg-card p-10 text-center" data-testid="copilot-error">
                <AlertTriangle className="h-8 w-8 text-[hsl(0_70%_65%)]" />
                <p className="max-w-md text-sm text-muted-foreground">{result.error}</p>
                <Link href="/chain">
                  <Button variant="outline" size="sm" className="border-border">
                    先在期权链看板选一个标的
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="space-y-4">
                {result.candidates.map((c, i) => (
                  <CandidateCard key={`${c.strategySlug}-${i}`} candidate={c} rank={i + 1} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-6">{children}</div>
    </Card>
  );
}

function BigChoice({
  active,
  onClick,
  testid,
  emoji,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  testid: string;
  emoji?: string;
  label: string;
  sub?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={
        "flex flex-col items-center justify-center gap-1 rounded-lg border p-5 text-center transition-colors " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-foreground hover:border-primary/50 hover:bg-muted/40")
      }
    >
      {emoji && <span className="text-2xl leading-none">{emoji}</span>}
      <span className="text-sm font-semibold">{label}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </button>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = "下一步",
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {onBack ? (
        <Button variant="ghost" className="gap-1.5" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" /> 上一步
        </Button>
      ) : (
        <span />
      )}
      <Button className="gap-1.5" onClick={onNext} disabled={nextDisabled} data-testid="button-next">
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function legLabel(leg: Leg): string {
  const sideSign = leg.side === "long" ? "+" : "-";
  if (leg.type === "stock") return `${sideSign}${leg.qty}× 正股`;
  const t = leg.type === "call" ? "Call" : "Put";
  const sideWord = leg.side === "long" ? "买" : "卖";
  return `${sideSign}${leg.qty}× ${sideWord} ${leg.K} ${t}`;
}

function CandidateCard({ candidate: c, rank }: { candidate: Candidate; rank: number }) {
  const isCash = c.strategySlug === "cash" || c.legs.length === 0;
  const encoded = isCash ? "" : encodeLegs(c.legs);
  return (
    <Card className="border-border bg-card p-5" data-testid={`candidate-card-${rank}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold" data-testid={`candidate-name-${rank}`}>
              {c.strategyName}
            </h3>
            {!isCash && (
              <Badge variant="outline" className="border-border font-mono text-[10px] text-muted-foreground">
                {c.strategySlug}
              </Badge>
            )}
          </div>
        </div>
        <Badge variant="outline" className="border-primary font-mono text-[10px] text-primary">
          候选 #{rank}
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.laoouReason}</p>

      {!isCash && (
        <>
          <div className="my-4 border-t border-border" />
          <div className="flex flex-wrap gap-2">
            {c.legs.map((leg, i) => (
              <span
                key={i}
                className={
                  "rounded-md border px-2 py-1 font-mono text-xs " +
                  (leg.side === "long"
                    ? "border-[hsl(var(--pnl-positive)/0.4)] text-[hsl(var(--pnl-positive))]"
                    : "border-[hsl(0_70%_65%/0.4)] text-[hsl(0_70%_65%)]")
                }
                data-testid={`candidate-leg-${rank}-${i}`}
              >
                {legLabel(leg)}
              </span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Max Gain" value={fmtMoney(c.expectedMaxGain)} positive />
            <Metric label="Max Loss" value={fmtMoney(c.expectedMaxLoss)} negative />
            <Metric
              label="Break Even"
              value={c.breakEvens.length ? c.breakEvens.map((b) => `$${b}`).join(" / ") : "—"}
            />
            <Metric
              label="概率 (Δ 近似)"
              value={c.probabilityITM != null ? `${(c.probabilityITM * 100).toFixed(0)}%` : "—"}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/builder/legs/${encoded}`}>
              <Button size="sm" className="gap-1.5" data-testid={`button-add-to-builder-${rank}`}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> 加到组合编辑器
              </Button>
            </Link>
            <Link href={`/stress/legs/${encoded}`}>
              <Button size="sm" variant="outline" className="gap-1.5 border-border" data-testid={`button-to-stress-${rank}`}>
                <Flame className="h-3.5 w-3.5" /> 先压测一下
              </Button>
            </Link>
            <Link href={`/strategies/${c.strategySlug}`}>
              <Button size="sm" variant="ghost" className="gap-1.5" data-testid={`button-detail-${rank}`}>
                <BookOpen className="h-3.5 w-3.5" /> 了解详情
              </Button>
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={
          "mt-0.5 font-mono text-sm font-semibold " +
          (positive
            ? "text-[hsl(var(--pnl-positive))]"
            : negative
              ? "text-[hsl(0_70%_65%)]"
              : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  );
}
