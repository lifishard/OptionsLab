import { useRoute } from "wouter";
import { StrategyPage } from "@/components/strategy-page";
import { STRATEGIES } from "@/lib/strategies/definitions";
import NotFound from "@/pages/not-found";

export default function StrategyDetail() {
  const [, params] = useRoute("/strategies/:slug");
  const slug = params?.slug ?? "";
  const def = STRATEGIES[slug];
  if (!def) return <NotFound />;
  return <StrategyPage def={def} />;
}
