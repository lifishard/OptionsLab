import { PlaceholderPage } from "@/components/placeholder-page";
import { Compass } from "lucide-react";

export default function Scenarios() {
  return (
    <PlaceholderPage
      title="情景导航"
      titleEn="Scenario Navigator"
      phase="Phase 5"
      Icon={Compass}
      description="在价格、时间、波动率三个维度上滑动，观察组合价值如何演化。理解一笔仓位在不同市场情景下会如何表现。"
    />
  );
}
