import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import {
  Activity,
  Layers,
  SlidersHorizontal,
  Compass,
  Flame,
  Table2,
  BookOpen,
  ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    href: "/greeks",
    Icon: Activity,
    title: "Greeks 教学",
    en: "Greeks Explorer",
    desc: "拖动参数，实时观察 Delta / Gamma / Theta / Vega / Rho 六联曲线如何随市场变化。",
    status: "Available" as const,
    accent: "text-greek-delta",
  },
  {
    href: "/learn",
    Icon: BookOpen,
    title: "Learn · 人话讲期权",
    en: "Learn",
    desc: "老欧叙事版长文·首篇《期权三要素》——边读边玩互动，把观点翻译成合约。",
    status: "Available" as const,
    accent: "text-greek-vega",
  },
  {
    href: "/strategies",
    Icon: Layers,
    title: "策略库",
    en: "Strategy Library",
    desc: "32 个策略——8 单腿 + 24 组合（价差、跨式、蝶鹰、日历、领口、比率、结构化），交互式损益图逐个拆解。",
    status: "Available" as const,
    accent: "text-greek-theta",
  },
  {
    href: "/builder",
    Icon: SlidersHorizontal,
    title: "组合编辑器",
    en: "Position Builder",
    desc: "自由搭建多腿仓位，实时损益图、盈亏平衡点、聚合 Greeks 与敏感度热力图。可从策略模板一键载入。",
    status: "Available" as const,
    accent: "text-greek-gamma",
  },
  {
    href: "/scenarios",
    Icon: Compass,
    title: "情景导航",
    en: "Scenario Navigator",
    desc: "回答四个问题，从 32 个策略里挑出最贴合你观点的那几个。",
    status: "Available" as const,
    accent: "text-greek-vega",
  },
  {
    href: "/chain",
    Icon: Table2,
    title: "期权链看板",
    en: "Option Chain",
    desc: "strike × expiry 矩阵，APR 与 Theta 渐变热力上色。",
    status: "Coming Soon" as const,
    accent: "text-greek-rho",
  },
  {
    href: "/scenarios",
    Icon: Flame,
    title: "风控热力图",
    en: "Risk Heatmap",
    desc: "组合级风险敞口热力，快速定位尾部风险来源。",
    status: "Coming Soon" as const,
    accent: "text-pnl-negative",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage:
              "radial-gradient(ellipse 60% 60% at 50% 30%, black, transparent)",
          }}
        />
        <div className="relative">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Logo className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono">OptionsLab · 期权实验室</span>
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            通过交互式可视化，理解期权定价、
            <span className="text-primary">Greeks</span> 与策略的风险收益特征。
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            希腊字母互动教学 · 老欧叙事版——所有数值均由内置的 Black-Scholes-Merton
            定价库实时计算，绝无假数据。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/greeks">
              <Button data-testid="button-launch-greeks" className="gap-2">
                打开 Greeks 教学
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/about">
              <Button variant="outline" data-testid="button-about" className="border-border">
                了解项目
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="pb-24">
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">模块 · Modules</h2>
        <p className="mb-6 font-mono text-xs text-muted-foreground/70">
          12 个 Phase · 当前 4 个模块上线
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const available = f.status === "Available";
            const inner = (
              <Card
                className={
                  "group h-full border-border bg-card p-5 transition-colors " +
                  (available ? "hover-elevate cursor-pointer" : "opacity-80")
                }
                data-testid={`card-feature-${i}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
                    <f.Icon className={"h-5 w-5 " + f.accent} />
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      "border-border font-mono text-[10px] " +
                      (available ? "text-primary" : "text-muted-foreground")
                    }
                  >
                    {f.status}
                  </Badge>
                </div>
                <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
                <p className="font-mono text-[11px] text-muted-foreground/70">{f.en}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
                {available && (
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    进入 <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                )}
              </Card>
            );
            return available ? (
              <Link key={i} href={f.href}>
                {inner}
              </Link>
            ) : (
              <div key={i}>{inner}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
