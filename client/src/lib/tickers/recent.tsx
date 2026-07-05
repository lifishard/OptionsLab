// Session-scoped "recent tickers" list, held in React state (NOT localStorage
// — sandbox iframe blocks browser storage). Mounted once in App.tsx.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const MAX_RECENTS = 8;

interface RecentTickersCtx {
  recents: string[];
  push: (symbol: string) => void;
  clear: () => void;
}

const Ctx = createContext<RecentTickersCtx | null>(null);

export function RecentTickersProvider({ children }: { children: React.ReactNode }) {
  // Seed with 5 well-known symbols so first-time users still see quick chips.
  const [recents, setRecents] = useState<string[]>([
    "SPY",
    "QQQ",
    "AAPL",
    "NVDA",
    "TSLA",
  ]);

  const push = useCallback((symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    if (!upper) return;
    setRecents((prev) => {
      const next = [upper, ...prev.filter((s) => s !== upper)];
      return next.slice(0, MAX_RECENTS);
    });
  }, []);

  const clear = useCallback(() => setRecents([]), []);

  const value = useMemo(() => ({ recents, push, clear }), [recents, push, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecentTickers(): RecentTickersCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Graceful fallback when a page is rendered outside the provider (e.g.,
    // in isolated tests). Returns a no-op stub so the component still mounts.
    return {
      recents: ["SPY", "QQQ", "AAPL", "NVDA", "TSLA"],
      push: () => {},
      clear: () => {},
    };
  }
  return v;
}
