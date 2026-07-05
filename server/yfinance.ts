// yfinance.ts — real Yahoo Finance option-chain fetch + Greeks/APR enrichment.
// Uses yahoo-finance2 for spot quote + option chain. No fake data: if Yahoo
// fails or returns nothing usable, callers should surface an error (see routes.ts).

import * as YahooFinanceNs from "yahoo-finance2";
import { ExtendedCookieJar } from "yahoo-finance2/lib/cookieJar";
import { bsmPrice } from "../client/src/lib/options/bsm";
import { delta, gamma, theta, vega } from "../client/src/lib/options/greeks";
import { impliedVol } from "../client/src/lib/options/iv";
import { seedYahooCrumb } from "./yahoo-crumb-seed";
import { getQuote } from "./quote-provider";

// yahoo-finance2's CJS/ESM default-export interop behaves inconsistently
// across bundlers (esbuild's `__toESM` does not always unwrap `.default`
// when the module is marked `external`). Resolve defensively at runtime.
const YahooFinanceCtor: any =
  (YahooFinanceNs as any).default?.default ?? (YahooFinanceNs as any).default ?? YahooFinanceNs;

// Yahoo edge sometimes returns 401/HTML for the default undici User-Agent on
// cloud egress (Railway, Fly, etc.). Sending a realistic browser UA + a
// language header keeps the JSON API path stable. Combined with the IPv4
// dispatcher forced in server/index.ts, this fixes the `fetch failed`
// observed on Railway boot.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// Shared cookie jar so we can pre-seed the A1/A3 cookie + crumb before any
// yahoo-finance2 call. See ./yahoo-crumb-seed.ts for the full rationale.
const cookieJar = new ExtendedCookieJar();

const yahooFinance = new YahooFinanceCtor({
  suppressNotices: ["yahooSurvey"],
  cookieJar,
  fetchOptions: { headers: BROWSER_HEADERS },
});

let seedPromise: Promise<void> | null = null;
let seededAt = 0;
const SEED_TTL_MS = 6 * 60 * 60 * 1000; // re-seed every 6h; crumbs last longer than that but be defensive

/**
 * Best-effort crumb seed. Options endpoints often work WITHOUT a crumb from
 * cloud IPs (Railway included) — the crumb endpoint itself is more aggressively
 * rate-limited than /v7/finance/options. So we try to seed once, but if the
 * seed 429s we don't block: yahoo-finance2 will still try the underlying call.
 */
async function ensureSeeded(): Promise<void> {
  const now = Date.now();
  if (seededAt && now - seededAt < SEED_TTL_MS) return;
  if (!seedPromise) {
    seedPromise = seedYahooCrumb(cookieJar)
      .then((crumb) => {
        seededAt = Date.now();
        console.log(`[yfinance] seeded Yahoo crumb: ${crumb.slice(0, 6)}…`);
      })
      .catch((err) => {
        console.warn("[yfinance] seed failed (continuing without crumb):", err?.message || err);
        // DO NOT rethrow — options endpoint may still work without a crumb.
        // Reset so a later request retries the seed.
        seedPromise = null;
      });
  }
  await seedPromise;
}

const R = 0.045; // risk-free rate, matches the rest of the app

export interface OptionRow {
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  model: number; // BSM theoretical price using the resolved IV
  iv: number | null; // decimal, e.g. 0.32; null if unsolvable
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  apr: number | null; // annualized premium yield if sold, Nomad Tsee definition
}

export interface StrikeRow {
  K: number;
  call: OptionRow;
  put: OptionRow;
}

export interface ExpiryGroup {
  date: string; // ISO date, e.g. "2026-07-18"
  dte: number;
  strikes: StrikeRow[];
}

export interface ChainSnapshot {
  symbol: string;
  spot: number;
  changePercent: number;
  fetchedAt: number; // Date.now() at fetch time
  expiries: ExpiryGroup[];
}

interface CacheEntry {
  snapshot: ChainSnapshot | null;
  error: string | null;
  fetchedAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const ERROR_TTL_MS = 60 * 1000; // 60s for failure caching

const cache = new Map<string, CacheEntry>();

const MAX_EXPIRIES = 6;
const MIN_DTE = 1;
const MAX_DTE = 90;
const STRIKE_BAND = 0.3; // ±30% around spot

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeDte(expiration: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((expiration.getTime() - now.getTime()) / msPerDay);
}

function safeMid(bid?: number | null, ask?: number | null): number {
  const b = bid ?? 0;
  const a = ask ?? 0;
  if (b > 0 && a > 0) return (a + b) / 2;
  return a > 0 ? a : b;
}

/** Resolve IV for a single contract: prefer Yahoo's own IV, else solve via BSM inverse. */
function resolveIv(
  yahooIv: number | null | undefined,
  mid: number,
  S: number,
  K: number,
  T: number,
  type: "call" | "put",
): number | null {
  if (typeof yahooIv === "number" && isFinite(yahooIv) && yahooIv > 0) {
    return yahooIv;
  }
  if (mid <= 0 || T <= 0) return null;
  const solved = impliedVol({ price: mid, S, K, T, r: R, type });
  return isFinite(solved) && solved > 0 ? solved : null;
}

/** APR = (mid / strike) × (365 / dte) × 100 — annualized premium yield for a short seller. */
export function computeApr(mid: number, strike: number, dte: number): number | null {
  if (mid <= 0 || strike <= 0 || dte <= 0) return null;
  return (mid / strike) * (365 / dte) * 100;
}

function buildOptionRow(
  contract: { strike: number; bid?: number | null; ask?: number | null; impliedVolatility?: number | null },
  S: number,
  T: number,
  dte: number,
  type: "call" | "put",
): OptionRow {
  const K = contract.strike;
  const bid = contract.bid ?? 0;
  const ask = contract.ask ?? 0;
  const mid = safeMid(bid, ask);
  const iv = resolveIv(contract.impliedVolatility, mid, S, K, T, type);

  let model = 0;
  let d: number | null = null;
  let g: number | null = null;
  let th: number | null = null;
  let v: number | null = null;
  let apr: number | null = null;

  if (iv !== null) {
    const sigma = iv;
    model = bsmPrice({ S, K, T, r: R, sigma, type });
    d = delta({ S, K, T, r: R, sigma, type });
    g = gamma({ S, K, T, r: R, sigma, type });
    th = theta({ S, K, T, r: R, sigma, type });
    v = vega({ S, K, T, r: R, sigma, type });
  }
  apr = computeApr(mid, K, dte);

  return { strike: K, bid, ask, mid, model, iv, delta: d, gamma: g, theta: th, vega: v, apr };
}

/**
 * Fetch a full option chain snapshot for `symbol` from Yahoo Finance.
 * Filters: only expiries with 1 <= dte <= 90, capped at 6 nearest;
 * strikes capped at ±30% around spot.
 */
export async function fetchOptionChain(symbol: string): Promise<ChainSnapshot> {
  // 1. Pull the current spot via the crumb-free quote provider first. If even
  //    this fails we bail early with a clear error instead of also failing on
  //    the options endpoint. This also decouples the price display from the
  //    options fetch — Copilot/Chain topbars can render a quote even if the
  //    /v7/finance/options call later 429s.
  const q = await getQuote(symbol);
  const spot = q.spot;
  const changePercent = q.changePercent;

  // 2. Attempt to seed the Yahoo crumb — best-effort. If Yahoo rate-limits
  //    the crumb endpoint we still try the options call unauthenticated.
  await ensureSeeded();

  const base = await yahooFinance.options(symbol);
  const allDates: Date[] = (base.expirationDates ?? []).map((d: string | number | Date) => new Date(d));
  const now = new Date();

  const eligible = allDates
    .map((d) => ({ date: d, dte: computeDte(d, now) }))
    .filter((e) => e.dte >= MIN_DTE && e.dte <= MAX_DTE)
    .sort((a, b) => a.dte - b.dte)
    .slice(0, MAX_EXPIRIES);

  if (eligible.length === 0) {
    throw new Error(`${symbol} 没有 1-90 天内的到期日可用`);
  }

  const loK = spot * (1 - STRIKE_BAND);
  const hiK = spot * (1 + STRIKE_BAND);

  const expiries: ExpiryGroup[] = [];

  for (const { date, dte } of eligible) {
    const chainForDate = await yahooFinance.options(symbol, { date });
    const group = chainForDate.options?.[0];
    if (!group) continue;

    const T = dte / 365;
    const callMap = new Map<number, StrikeRow["call"]>();
    const putMap = new Map<number, StrikeRow["put"]>();

    for (const c of group.calls ?? []) {
      if (c.strike < loK || c.strike > hiK) continue;
      callMap.set(c.strike, buildOptionRow(c, spot, T, dte, "call"));
    }
    for (const p of group.puts ?? []) {
      if (p.strike < loK || p.strike > hiK) continue;
      putMap.set(p.strike, buildOptionRow(p, spot, T, dte, "put"));
    }

    const strikeSet = new Set<number>([...Array.from(callMap.keys()), ...Array.from(putMap.keys())]);
    const strikes: StrikeRow[] = Array.from(strikeSet)
      .sort((a, b) => a - b)
      .map((K) => ({
        K,
        call: callMap.get(K) ?? buildOptionRow({ strike: K, bid: 0, ask: 0, impliedVolatility: null }, spot, T, dte, "call"),
        put: putMap.get(K) ?? buildOptionRow({ strike: K, bid: 0, ask: 0, impliedVolatility: null }, spot, T, dte, "put"),
      }));

    expiries.push({ date: toDateOnly(date), dte, strikes });
  }

  return {
    symbol: symbol.toUpperCase(),
    spot,
    changePercent,
    fetchedAt: Date.now(),
    expiries,
  };
}

/**
 * Cached accessor. TTL 5 minutes for success, 60s for failure (avoid hammering
 * a rate-limited/broken ticker). Never fabricates data — throws on failure so
 * the caller (route) can surface a real error.
 */
export async function getOptionChain(symbol: string): Promise<ChainSnapshot> {
  const key = symbol.toUpperCase();
  const now = Date.now();
  const cached = cache.get(key);

  if (cached) {
    const ttl = cached.error ? ERROR_TTL_MS : TTL_MS;
    if (now - cached.fetchedAt < ttl) {
      if (cached.error) throw new Error(cached.error);
      return cached.snapshot as ChainSnapshot;
    }
  }

  try {
    const snapshot = await fetchOptionChain(key);
    cache.set(key, { snapshot, error: null, fetchedAt: Date.now() });
    return snapshot;
  } catch (err: any) {
    const message = err?.message || `读取 ${key} 期权链失败`;
    cache.set(key, { snapshot: null, error: message, fetchedAt: Date.now() });
    throw new Error(message);
  }
}

/** Fire-and-forget warm cache for boot-time preloading. Never throws. */
export function warmCache(symbols: string[]): void {
  for (const sym of symbols) {
    getOptionChain(sym).catch((err) => {
      console.error(`[yfinance] warm-cache failed for ${sym}:`, err?.message || err);
    });
  }
}
