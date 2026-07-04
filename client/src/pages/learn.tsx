import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { bsmPrice } from "@/lib/options/bsm";
import { theta } from "@/lib/options/greeks";
import { DeltaKInteractive } from "@/components/delta-k-interactive";
import { LEARN } from "./walkthrough-content";
import { Clock } from "lucide-react";

// ---- Embedded interactive 1: 观点 -> 3 候选合约（静态示范）----
// Deterministic mapping: 强烈看涨 -> OTM Call, 温和 -> ATM Call, 轻微 -> ITM Call.
// 观点为固定示范文本 —— 目前不做 NLP 识别，所以设为静态，不给用户"以为能改"的假象。
function ViewTranslator() {
  const view = "我觉得 SPY 未来 30 天会涨到 105";
  const candidates = [
    {
      strength: "强烈看涨",
      hint: "预期大涨、愿赌高赔率",
      contract: "SPY 30DTE OTM Call · K=110",
      character: "低成本、高杠杆、押\u201c走得远\u201d",
      color: "var(--greek-vega)",
    },
    {
      strength: "温和看涨",
      hint: "方向明确、控制风险",
      contract: "SPY 30DTE ATM Call · K=100",
      character: "Delta 约 0.5，攻守平衡",
      color: "var(--greek-delta)",
    },
    {
      strength: "轻微看涨",
      hint: "更像持有股票",
      contract: "SPY 30DTE ITM Call · K=95",
      character: "高 Delta，像股票替代品",
      color: "var(--greek-rho)",
    },
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="interactive-translator">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">示范观点</Label>
        <span className="font-mono text-[10px] text-muted-foreground/60">示例 · 不可编辑</span>
      </div>
      <div
        className="mt-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
        data-testid="text-view"
      >
        {view}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        同一个观点，按“你觉得能走多远”翻译成三种候选：
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {candidates.map((c) => (
          <div
            key={c.strength}
            className="rounded-md border border-border bg-muted/30 p-3"
            data-testid={`candidate-${c.strength}`}
          >
            <div className="text-xs font-semibold" style={{ color: `hsl(${c.color})` }}>
              {c.strength}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground/70">{c.hint}</div>
            <div className="mt-2 font-mono text-[11px] text-foreground">{c.contract}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{c.character}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Embedded interactive 2: SPY vs TSLA 标的性格 ----
function UnderlyingCompare() {
  // Same "30DTE ATM Call", different underlying character (different IV).
  const cards = [
    {
      name: "SPY · 慢趋势",
      ivPct: 18,
      note: "低波动、慢节奏——Theta 温和，靠趋势慢慢兑现。",
      color: "var(--greek-delta)",
    },
    {
      name: "TSLA · 高波动",
      ivPct: 60,
      note: "高波动、消息驱动——权利金贵、Vega 大，IV 一泄就疼。",
      color: "var(--greek-vega)",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="interactive-underlying">
      {cards.map((c) => {
        const price = bsmPrice({ S: 100, K: 100, T: 30 / 365, r: 0.045, sigma: c.ivPct / 100, type: "call" });
        const th = theta({ S: 100, K: 100, T: 30 / 365, r: 0.045, sigma: c.ivPct / 100, type: "call" }, true);
        // Mini premium-vs-days sparkline for this IV.
        const spark = Array.from({ length: 31 }, (_, i) => {
          const d = 30 - i;
          return {
            d,
            p: bsmPrice({ S: 100, K: 100, T: Math.max(d, 0.01) / 365, r: 0.045, sigma: c.ivPct / 100, type: "call" }),
          };
        });
        return (
          <div key={c.name} className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-semibold" style={{ color: `hsl(${c.color})` }}>
              {c.name}
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">IV {c.ivPct}%</div>
            <div className="mt-2 flex gap-4 font-mono text-xs">
              <span className="text-foreground">权利金 {price.toFixed(2)}</span>
              <span style={{ color: "hsl(var(--greek-theta))" }}>θ/d {th.toFixed(3)}</span>
            </div>
            <div className="mt-2 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spark} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="d" hide reversed />
                  <YAxis hide domain={[0, "dataMax"]} />
                  <Line
                    type="monotone"
                    dataKey="p"
                    stroke={`hsl(${c.color})`}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{c.note}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Embedded interactive 3: DTE 权利金塌陷 ----
const DTE_OPTIONS = [7, 30, 60, 180];
function DecayInteractive() {
  const [dte, setDte] = useState(30);
  const series = useMemo(() => {
    const rows: { d: number; p: number }[] = [];
    for (let d = dte; d >= 0; d -= Math.max(1, Math.round(dte / 60))) {
      rows.push({
        d,
        p: bsmPrice({ S: 100, K: 100, T: Math.max(d, 0.0001) / 365, r: 0.045, sigma: 0.3, type: "call" }),
      });
    }
    return rows;
  }, [dte]);
  const curPrice = bsmPrice({ S: 100, K: 100, T: dte / 365, r: 0.045, sigma: 0.3, type: "call" });
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="interactive-decay">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: "hsl(var(--greek-theta))" }}>
          权利金塌陷曲线 · S=K=100, IV=30%
        </div>
        <span className="font-mono text-xs" style={{ color: "hsl(var(--greek-theta))" }}>
          {curPrice.toFixed(2)}
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="d"
              type="number"
              domain={[0, dte]}
              reversed
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickFormatter={(v) => `${v}d`}
              stroke="hsl(var(--border))"
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              width={44}
              stroke="hsl(var(--border))"
            />
            <Line
              type="monotone"
              dataKey="p"
              stroke="hsl(var(--greek-theta))"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceDot x={dte} y={curPrice} r={5} fill="hsl(var(--greek-theta))" stroke="hsl(var(--background))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <Label className="text-xs text-muted-foreground">选择 DTE（剩余天数）</Label>
          <span className="font-mono text-xs tabular text-foreground">{dte} 天</span>
        </div>
        <div className="flex gap-2">
          {DTE_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDte(d)}
              data-testid={`dte-${d}`}
              className={
                "rounded-md border px-3 py-1 text-xs font-medium transition-colors hover-elevate " +
                (dte === d ? "border-primary text-primary" : "border-border text-muted-foreground")
              }
            >
              {d}
            </button>
          ))}
        </div>
        <Slider value={[dte]} min={1} max={180} step={1} onValueChange={(v) => setDte(v[0])} data-testid="slider-dte" />
        <div className="text-[11px] text-muted-foreground">
          越靠近到期（左侧），曲线塌得越快——尤其是最后 30 天。
        </div>
      </div>
    </div>
  );
}

export default function Learn() {
  const interactives = [
    <ViewTranslator key="translator" />,
    <UnderlyingCompare key="underlying" />,
    <DecayInteractive key="decay" />,
    <DeltaKInteractive key="deltak" />,
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Hero */}
      <div className="mb-3">
        <Badge variant="outline" className="border-border font-mono text-[10px] text-primary">
          Learn · 首篇
        </Badge>
      </div>
      <h1 className="text-2xl font-semibold leading-tight tracking-tight" data-testid="learn-title">
        {LEARN.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{LEARN.subtitle}</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
          <Clock className="h-3 w-3" /> {LEARN.readTag}
        </span>
      </div>

      {/* Lead */}
      <p className="mt-6 border-l-2 border-border pl-4 text-[15px] italic leading-relaxed text-slate-300">
        {LEARN.lead}
      </p>

      {/* Chapters */}
      <div className="mt-10 space-y-12">
        {LEARN.chapters.map((ch, i) => (
          <section key={i} data-testid={`chapter-${i + 1}`}>
            <h2 className="text-lg font-semibold tracking-tight">{ch.heading}</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300">
              {ch.prose.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
            <div className="mt-5">{interactives[i]}</div>
          </section>
        ))}
      </div>

      {/* Closing quote */}
      <div className="mt-12 border-l-4 border-yellow-500 bg-yellow-500/10 px-4 py-4 text-[15px] leading-relaxed text-yellow-100">
        <span className="mr-1">✨</span>
        {LEARN.closingQuote}
      </div>

      {/* Signature */}
      <div className="mt-8 space-y-1 text-xs text-slate-500">
        {LEARN.signature.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
