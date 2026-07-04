import { Card } from "@/components/ui/card";
import { Logo } from "@/components/logo";

export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="mb-8 flex items-center gap-3">
        <Logo className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">关于 OptionsLab</h1>
          <p className="text-sm text-muted-foreground">About · 期权实验室</p>
        </div>
      </div>

      <Card className="space-y-4 border-border bg-card p-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="text-foreground">OptionsLab</span> 是一个交互式的美股期权学习平台，目标是通过可视化建立对期权定价、
          Greeks 与策略风险收益特征的直觉——而不是死记公式。
        </p>
        <p>
          所有数值都由项目内置的纯 TypeScript 定价库实时计算：Black-Scholes-Merton 定价、五大 Greeks、
          隐含波动率反解（Newton-Raphson + bisection），以及多腿组合损益引擎。没有任何假数据。
        </p>
        <p>
          项目分 12 个阶段迭代：策略库、组合编辑器、情景导航、风控热力图、期权链看板等模块将陆续上线。
          当前可用模块为 <span className="text-primary">Greeks 交互教学</span>。
        </p>
        <p className="text-xs text-muted-foreground/70">
          仅用于教育目的，不构成任何投资建议。
        </p>
      </Card>
    </div>
  );
}
