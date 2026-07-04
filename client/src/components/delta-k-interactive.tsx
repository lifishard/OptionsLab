// Reusable Delta × 行权价 mini interactive. Used both inline on the Greeks
// Walkthrough (Delta step) and embedded in the Learn article (chapter 4).
// Drag K, watch Delta of a Call move from ~0 (OTM) to ~1 (ITM). Uses the
// existing BSM/Greeks lib — no new pricing logic.

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { delta } from "@/lib/options/greeks";

const S = 100;
const T = 30 / 365;
const R = 0.045;
const SIGMA = 0.3;

export function DeltaKInteractive({ compact = false }: { compact?: boolean }) {
  const [K, setK] = useState(100);

  // Delta as a function of K (fixed S=100), so the user sees OTM→ITM sweep.
  const series = useMemo(() => {
    const rows: { k: number; delta: number }[] = [];
    for (let k = 60; k <= 140; k += 0.5) {
      rows.push({ k, delta: delta({ S, K: k, T, r: R, sigma: SIGMA, type: "call" }) });
    }
    return rows;
  }, []);

  const currentDelta = useMemo(
    () => delta({ S, K, T, r: R, sigma: SIGMA, type: "call" }),
    [K],
  );

  const moneyness = K < S - 1 ? "实值 ITM" : K > S + 1 ? "虚值 OTM" : "平值 ATM";

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="delta-k-interactive">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-semibold" style={{ color: "hsl(var(--greek-delta))" }}>
          Delta × 行权价 K
        </div>
        <div className="font-mono text-xs" style={{ color: "hsl(var(--greek-delta))" }}>
          Δ = {currentDelta.toFixed(3)} · {moneyness}
        </div>
      </div>
      <div className={compact ? "h-40" : "h-52"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="k"
              type="number"
              domain={[60, 140]}
              tickCount={5}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              width={40}
              stroke="hsl(var(--border))"
            />
            <ReferenceLine x={S} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Line
              type="monotone"
              dataKey="delta"
              stroke="hsl(var(--greek-delta))"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={K}
              y={currentDelta}
              r={5}
              fill="hsl(var(--greek-delta))"
              stroke="hsl(var(--background))"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <Label className="text-xs text-muted-foreground">
            行权价 K <span className="font-mono text-[10px] text-muted-foreground/60">S 固定 100</span>
          </Label>
          <span className="font-mono text-xs tabular text-foreground">{K.toFixed(1)}</span>
        </div>
        <Slider
          value={[K]}
          min={60}
          max={140}
          step={0.5}
          onValueChange={(v) => setK(v[0])}
          data-testid="slider-delta-k"
        />
      </div>
    </div>
  );
}
