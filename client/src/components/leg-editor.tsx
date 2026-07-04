// ── Shared leg-editor component ──
// Extracted from builder.tsx (Phase 4) so both the Position Builder and the
// Roll Position Engine (Phase 8) edit legs with the SAME UI. Pure presentational
// component: parent owns the Leg[] state and passes onChange/onRemove callbacks.
// Karpathy: Read Before Writing (same markup/testids builder had) + Simplicity First.

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import type { Leg } from "@/lib/strategies/definitions";

export function LegEditor({
  index,
  leg,
  onChange,
  onRemove,
  testidPrefix = "leg",
}: {
  index: number;
  leg: Leg;
  onChange: (patch: Partial<Leg>) => void;
  onRemove: () => void;
  /** prefix so builder + roll can render editors without data-testid collisions */
  testidPrefix?: string;
}) {
  const isStock = leg.type === "stock";
  const long = leg.side === "long";
  const tid = `${testidPrefix}-${index}`;
  return (
    <Card className="border-border bg-card p-3" data-testid={tid}>
      <div className="flex items-center justify-between gap-2">
        {/* type toggle */}
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["call", "put", "stock"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onChange({ type: t, K: t === "stock" ? undefined : leg.K ?? 100 })}
              className={`px-2.5 py-1 font-mono text-[11px] transition-colors ${
                leg.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`${tid}-type-${t}`}
            >
              {t === "call" ? "Call" : t === "put" ? "Put" : "股票"}
            </button>
          ))}
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground transition-colors hover:text-red-400"
          aria-label="删除这条腿"
          data-testid={`${tid}-remove`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {/* side toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">方向</span>
          <button
            onClick={() => onChange({ side: long ? "short" : "long" })}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-semibold"
            style={{
              borderColor: long ? "hsl(var(--pnl-positive) / 0.5)" : "hsl(var(--pnl-negative) / 0.5)",
              color: long ? "hsl(var(--pnl-positive))" : "hsl(var(--pnl-negative))",
              background: long ? "hsl(var(--pnl-positive) / 0.08)" : "hsl(var(--pnl-negative) / 0.08)",
            }}
            data-testid={`${tid}-side`}
          >
            {long ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {long ? "买入 Long" : "卖出 Short"}
          </button>
        </div>

        {/* strike */}
        {!isStock && (
          <NumField
            label="行权价 K"
            value={leg.K ?? 100}
            step={1}
            onChange={(v) => onChange({ K: v })}
            testid={`${tid}-strike`}
          />
        )}
        {/* qty */}
        <NumField
          label={isStock ? "手数" : "数量"}
          value={leg.qty}
          step={1}
          min={1}
          onChange={(v) => onChange({ qty: Math.max(1, Math.round(v)) })}
          testid={`${tid}-qty`}
        />
        {/* DTE offset */}
        {!isStock && (
          <NumField
            label="DTE 偏移"
            value={leg.dteOffset ?? 0}
            step={5}
            min={0}
            onChange={(v) => onChange({ dteOffset: v > 0 ? v : undefined })}
            testid={`${tid}-dte`}
          />
        )}
      </div>
    </Card>
  );
}

export function NumField({
  label,
  value,
  step,
  min,
  onChange,
  testid,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  onChange: (v: number) => void;
  testid: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-20 font-mono text-xs"
        data-testid={testid}
      />
    </div>
  );
}
