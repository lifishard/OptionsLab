// Phase 8 · Chain page durable cache (Tradier 审核期过渡方案)
//
// Layered cache for /api/chain/:symbol so Railway can survive Yahoo IP-based
// rate limiting on /v7/finance/options and /v8/finance/chart:
//
//   1. In-memory Map (per-process, 15 min TTL for success)
//   2. Postgres options_snapshots table (durable, survives restart)
//   3. Yahoo (via existing getOptionChain in yfinance.ts) — only when both
//      layers miss OR the stale Postgres row is older than STALE_MS
//
// A background whitelist refresh loop keeps hot tickers warm so users hit
// memory / DB and never touch Yahoo synchronously.

import type { ChainSnapshot } from "./yfinance";
import { getOptionChain } from "./yfinance";
import { storage } from "./storage";

// ── Tunables ────────────────────────────────────────────────────
const MEM_TTL_MS = 15 * 60 * 1000;   // 15 min success TTL in memory
const STALE_MS = 30 * 60 * 1000;     // Postgres row older than 30 min → refetch
const REFRESH_MS = 15 * 60 * 1000;   // whitelist refresh cadence
const REFRESH_JITTER_MS = 30 * 1000; // spread requests to avoid Yahoo burst

// Hot symbols we prewarm at startup and refresh on a timer. Extend as needed.
export const WHITELIST = [
  "SPY", "QQQ", "AAPL", "NVDA", "TSLA",
  "MSFT", "GOOGL", "META", "AMZN", "TQQQ",
] as const;

// ── In-memory layer ─────────────────────────────────────────────
interface MemEntry {
  snapshot: ChainSnapshot;
  storedAt: number;
}
const mem = new Map<string, MemEntry>();

// ── Public API ──────────────────────────────────────────────────
/**
 * Returns a chain snapshot, preferring cache. Order:
 *   memory (fresh)  →  Postgres (fresh)  →  Yahoo (writes both)
 *
 * If Yahoo fails BUT we have any Postgres row, we return the stale row
 * rather than surfacing a 502 to the user. Freshness is communicated via
 * `snapshot.fetchedAt` which the frontend already displays.
 */
export async function getChainCached(symbol: string): Promise<ChainSnapshot> {
  const key = symbol.toUpperCase();
  const now = Date.now();

  // 1. Memory
  const m = mem.get(key);
  if (m && now - m.storedAt < MEM_TTL_MS) {
    return m.snapshot;
  }

  // 2. Postgres (fresh)
  const row = await storage.getLatestOptionsSnapshot(key).catch(() => undefined);
  if (row && now - Number(row.fetchedAt) < STALE_MS) {
    const snap = parseSnapshot(row.payload);
    if (snap) {
      mem.set(key, { snapshot: snap, storedAt: now });
      return snap;
    }
  }

  // 3. Yahoo (with stale-if-error fallback)
  try {
    const fresh = await getOptionChain(key);
    mem.set(key, { snapshot: fresh, storedAt: Date.now() });
    // Fire-and-forget durable write — never block the response on it.
    storage
      .upsertOptionsSnapshot(key, fresh.fetchedAt, JSON.stringify(fresh))
      .catch((err) => {
        console.error(`[chain-cache] upsert failed for ${key}:`, err?.message || err);
      });
    return fresh;
  } catch (err: any) {
    // Yahoo failed. If we have ANY snapshot in Postgres (even stale), serve it.
    if (row) {
      const snap = parseSnapshot(row.payload);
      if (snap) {
        console.warn(`[chain-cache] serving stale ${key} (age ${((now - Number(row.fetchedAt)) / 1000).toFixed(0)}s) — Yahoo error: ${err?.message}`);
        return snap;
      }
    }
    throw err;
  }
}

/**
 * Best-effort prewarm at boot. Never throws, never blocks. Small stagger so
 * the process doesn't hit Yahoo with 10 parallel requests.
 */
export async function warmupWhitelist(): Promise<void> {
  console.log(`[chain-cache] warmup start (${WHITELIST.length} tickers)`);
  for (let i = 0; i < WHITELIST.length; i++) {
    const sym = WHITELIST[i];
    setTimeout(() => {
      getChainCached(sym)
        .then((snap) => {
          console.log(`[chain-cache] warmed ${sym} spot=$${snap.spot.toFixed(2)}`);
        })
        .catch((err) => {
          console.warn(`[chain-cache] warmup ${sym} failed: ${err?.message || err}`);
        });
    }, i * REFRESH_JITTER_MS);
  }
}

/**
 * Periodic refresh so hot tickers stay warm even if no user requests them.
 * Runs every REFRESH_MS. Non-blocking — errors are logged and ignored.
 */
let refreshTimer: NodeJS.Timeout | null = null;
export function startRefreshLoop(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    console.log("[chain-cache] periodic refresh tick");
    for (let i = 0; i < WHITELIST.length; i++) {
      const sym = WHITELIST[i];
      setTimeout(() => {
        // Force-bypass memory by invalidating first so we go to Yahoo.
        mem.delete(sym);
        getChainCached(sym).catch((err) => {
          console.warn(`[chain-cache] refresh ${sym} failed: ${err?.message || err}`);
        });
      }, i * REFRESH_JITTER_MS);
    }
  }, REFRESH_MS);
  console.log(`[chain-cache] refresh loop started (every ${REFRESH_MS / 60000} min)`);
}

// ── Internal helpers ────────────────────────────────────────────
function parseSnapshot(payload: string): ChainSnapshot | null {
  try {
    return JSON.parse(payload) as ChainSnapshot;
  } catch (err) {
    console.error("[chain-cache] payload parse failed:", err);
    return null;
  }
}
