import { PlaceholderPage } from "@/components/placeholder-page";
import { SlidersHorizontal } from "lucide-react";

export default function Builder() {
  return (
    <PlaceholderPage
      title="组合编辑器"
      titleEn="Position Builder"
      phase="Phase 4"
      Icon={SlidersHorizontal}
      description="自由组合多腿仓位，实时查看到期损益图、当前理论 PnL、盈亏平衡点与聚合 Greeks。底层由本项目的 payoff 引擎驱动。"
    />
  );
}
