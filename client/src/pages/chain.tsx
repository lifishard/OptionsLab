import { PlaceholderPage } from "@/components/placeholder-page";
import { Table2 } from "lucide-react";

export default function Chain() {
  return (
    <PlaceholderPage
      title="期权链看板"
      titleEn="Option Chain"
      phase="Phase 6"
      Icon={Table2}
      description="strike × expiry 矩阵看板，APR 与 Theta 列用渐变热力上色，快速扫描哪一格最有卖方价值——量化交易台的经典视图。"
    />
  );
}
