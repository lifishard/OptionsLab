import { PlaceholderPage } from "@/components/placeholder-page";
import { Layers } from "lucide-react";

export default function Strategies() {
  return (
    <PlaceholderPage
      title="策略库"
      titleEn="Strategy Library"
      phase="Phase 3"
      Icon={Layers}
      description="预置常见期权策略（垂直价差、跨式、蝶式、铁鹰等），一键载入组合编辑器，对比每种结构的风险收益曲线与 Greeks 特征。"
    />
  );
}
