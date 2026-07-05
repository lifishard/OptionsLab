// ticker-search.tsx — Ticker search + recent-picks input used by Copilot,
// Chain, and Stress pages. Replaces the old fixed 5-symbol pill row.
//
// UX:
//   1. Type at least 1 char → debounced fetch to /api/tickers/search.
//   2. Recent picks (React Context, session-scoped) shown as chips above.
//   3. Selecting a hit calls onSelect(symbol) and adds it to recents.
//   4. `activeSymbol` shows the currently loaded ticker; also displays live
//      spot via /api/quote/:symbol once selected (small badge to the right).
//
// Note: recent picks live in RecentTickersProvider (client/src/lib/tickers/recent.tsx)
// which is mounted once in App.tsx and uses React state — no localStorage
// (sandbox iframe blocks it).

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useRecentTickers } from "@/lib/tickers/recent";

interface TickerHit {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
}

interface QuoteSnapshot {
  symbol: string;
  spot: number;
  changePercent: number;
  currency: string;
}

interface TickerSearchProps {
  /** Currently-selected symbol; used to render live spot preview. */
  activeSymbol: string | null;
  onSelect: (symbol: string) => void;
  /** Optional label shown above the input. */
  label?: string;
  /** Optional placeholder text. */
  placeholder?: string;
  /** Where the recent-tickers chip row appears. Defaults to "above" the input. */
  chipPlacement?: "above" | "below" | "hidden";
  /** Test ID prefix. */
  testId?: string;
}

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function TickerSearch({
  activeSymbol,
  onSelect,
  label,
  placeholder = "搜索美股代码或公司名（AAPL / apple / MSFT…）",
  chipPlacement = "above",
  testId = "ticker-search",
}: TickerSearchProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const debounced = useDebounced(query, 250);
  const { recents, push } = useRecentTickers();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const searchQuery = useQuery<TickerHit[]>({
    queryKey: ["/api/tickers/search", debounced],
    enabled: debounced.trim().length >= 1,
    staleTime: 60 * 1000,
  });

  const showDropdown = focused && debounced.trim().length >= 1;

  const handlePick = (symbol: string) => {
    const upper = symbol.toUpperCase();
    push(upper);
    onSelect(upper);
    setQuery("");
    setFocused(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const list = searchQuery.data ?? [];
      if (list.length > 0) {
        e.preventDefault();
        handlePick(list[0].symbol);
      } else if (/^[A-Z0-9.\-]{1,6}$/i.test(query.trim())) {
        e.preventDefault();
        handlePick(query.trim());
      }
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  const chipRow = recents.length > 0 && chipPlacement !== "hidden" ? (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`${testId}-recents`}>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        最近查看
      </span>
      {recents.map((sym) => (
        <button
          key={sym}
          onClick={() => onSelect(sym)}
          className={
            "rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors " +
            (activeSymbol === sym
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground")
          }
          data-testid={`${testId}-recent-${sym}`}
        >
          {sym}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
      )}

      {chipPlacement === "above" && chipRow && <div className="mb-2">{chipRow}</div>}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="h-10 pl-9 pr-9 font-mono text-sm"
          data-testid={`${testId}-input`}
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            data-testid={`${testId}-clear`}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Active symbol + live quote */}
      {activeSymbol && !showDropdown && (
        <ActiveQuote symbol={activeSymbol} testId={testId} />
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-popover shadow-lg"
          data-testid={`${testId}-dropdown`}
        >
          {searchQuery.isLoading && (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在搜索…
            </div>
          )}
          {searchQuery.isError && (
            <div className="px-3 py-4 text-xs text-[hsl(0_70%_65%)]">
              搜索失败：{(searchQuery.error as Error)?.message || "未知错误"}
            </div>
          )}
          {!searchQuery.isLoading && !searchQuery.isError && (searchQuery.data ?? []).length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              没找到匹配的美股 / ETF。按 Enter 直接用 “{query.toUpperCase()}”。
            </div>
          )}
          {(searchQuery.data ?? []).map((hit) => (
            <button
              key={hit.symbol}
              onClick={() => handlePick(hit.symbol)}
              className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted/50"
              data-testid={`${testId}-hit-${hit.symbol}`}
            >
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold text-foreground">{hit.symbol}</div>
                <div className="truncate text-[11px] text-muted-foreground">{hit.name}</div>
              </div>
              <div className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {hit.exchange} · {hit.quoteType}
              </div>
            </button>
          ))}
        </div>
      )}

      {chipPlacement === "below" && chipRow && <div className="mt-2">{chipRow}</div>}
    </div>
  );
}

/** Small live-spot preview shown next to the input once a symbol is loaded. */
function ActiveQuote({ symbol, testId }: { symbol: string; testId: string }) {
  const quoteQuery = useQuery<QuoteSnapshot>({
    queryKey: ["/api/quote", symbol],
    staleTime: 30 * 1000,
  });

  if (quoteQuery.isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span>{symbol}</span>
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }
  if (quoteQuery.isError) {
    return (
      <div
        className="mt-2 font-mono text-[11px] text-[hsl(0_70%_65%)]"
        data-testid={`${testId}-quote-error`}
      >
        {symbol} · 读取现价失败 — {(quoteQuery.error as Error)?.message || "unknown"}
      </div>
    );
  }
  const q = quoteQuery.data;
  if (!q) return null;
  const positive = q.changePercent >= 0;
  return (
    <div
      className="mt-2 flex items-center gap-2 font-mono text-[11px]"
      data-testid={`${testId}-quote`}
    >
      <span className="text-muted-foreground">{q.symbol}</span>
      <span className="text-foreground">${q.spot.toFixed(2)}</span>
      <span
        className={
          positive ? "text-[hsl(var(--pnl-positive))]" : "text-[hsl(0_70%_65%)]"
        }
      >
        ({positive ? "+" : ""}
        {q.changePercent.toFixed(2)}%)
      </span>
    </div>
  );
}
