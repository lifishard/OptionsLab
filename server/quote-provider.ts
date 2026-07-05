// quote-provider.ts — lightweight spot-quote layer that does NOT need Yahoo's
// crumb/cookie handshake. We keep the option-chain path in yfinance.ts (which
// still requires crumb), but every "just show me the current price" call site
// (Copilot step 1, Chain topbar, Stress topbar, TickerSearch preview) routes
// through here so a rate-limited crumb endpoint does NOT break basic quotes.
//
// Provider chain:
//   1. Yahoo v8 chart  (https://query1.finance.yahoo.com/v8/finance/chart/…)
//      — no crumb needed, unauthenticated, works on Railway even when
//        Yahoo's crumb/getcrumb endpoint 429s cloud IPs.
//   2. Finnhub /quote  (only if FINNHUB_API_KEY is set) — 60 req/min free.
//
// A 60-second in-memory cache keeps us far under Yahoo's per-IP soft cap
// even if the UI polls aggressively.

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

export interface QuoteSnapshot {
  symbol: string;
  spot: number;
  changePercent: number; // percent, not decimal (e.g. 1.23 = +1.23%)
  currency: string; // "USD" default
  source: "yahoo-chart" | "finnhub";
  fetchedAt: number;
}

interface CacheEntry {
  quote: QuoteSnapshot | null;
  error: string | null;
  fetchedAt: number;
}

const TTL_MS = 60 * 1000; // 60s success cache
const ERROR_TTL_MS = 15 * 1000; // 15s failure cache (short — user may retry)
const cache = new Map<string, CacheEntry>();

/** Yahoo v8 chart — crumb-free, unauthenticated. Works on cloud egress.
 * Tries query1 and query2 hosts — Yahoo balances load between them, and
 * one host will sometimes 429 while the other still responds. */
async function fetchYahooChart(symbol: string): Promise<QuoteSnapshot> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  const errors: string[] = [];
  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?interval=1d&range=1d`;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        errors.push(`${host} HTTP ${res.status}`);
        continue;
      }
      const json: any = await res.json();
      const result = json?.chart?.result?.[0];
      const meta = result?.meta;
      if (!meta || typeof meta.regularMarketPrice !== "number") {
        errors.push(
          `${host}: ${json?.chart?.error?.description || "missing regularMarketPrice"}`,
        );
        continue;
      }
      const spot = meta.regularMarketPrice;
      const prevClose =
        typeof meta.chartPreviousClose === "number"
          ? meta.chartPreviousClose
          : typeof meta.previousClose === "number"
            ? meta.previousClose
            : spot;
      const changePercent = prevClose > 0 ? ((spot - prevClose) / prevClose) * 100 : 0;
      return {
        symbol: symbol.toUpperCase(),
        spot,
        changePercent,
        currency: typeof meta.currency === "string" ? meta.currency : "USD",
        source: "yahoo-chart",
        fetchedAt: Date.now(),
      };
    } catch (err: any) {
      errors.push(`${host}: ${err?.message || err}`);
    }
  }
  throw new Error(`yahoo-chart failed on all hosts (${errors.join("; ")})`);
}

/** Finnhub /quote — optional fallback, needs FINNHUB_API_KEY. */
async function fetchFinnhub(symbol: string): Promise<QuoteSnapshot> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY not set");
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
    symbol,
  )}&token=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] } });
  if (!res.ok) {
    throw new Error(`finnhub HTTP ${res.status}`);
  }
  const json: any = await res.json();
  const spot = typeof json?.c === "number" ? json.c : 0;
  if (spot <= 0) {
    throw new Error("finnhub returned no current price (unknown symbol?)");
  }
  const prev = typeof json?.pc === "number" ? json.pc : spot;
  const changePercent = prev > 0 ? ((spot - prev) / prev) * 100 : 0;
  return {
    symbol: symbol.toUpperCase(),
    spot,
    changePercent,
    currency: "USD",
    source: "finnhub",
    fetchedAt: Date.now(),
  };
}

/**
 * Get the current spot quote for `symbol`. Tries Yahoo v8 chart first
 * (no crumb needed), falls back to Finnhub if key is configured.
 * Never fabricates data — throws on failure.
 */
export async function getQuote(symbol: string): Promise<QuoteSnapshot> {
  const key = symbol.toUpperCase();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached) {
    const ttl = cached.error ? ERROR_TTL_MS : TTL_MS;
    if (now - cached.fetchedAt < ttl) {
      if (cached.error) throw new Error(cached.error);
      return cached.quote as QuoteSnapshot;
    }
  }

  const errors: string[] = [];
  try {
    const q = await fetchYahooChart(key);
    cache.set(key, { quote: q, error: null, fetchedAt: Date.now() });
    return q;
  } catch (err: any) {
    errors.push(`yahoo-chart: ${err?.message || err}`);
  }

  if (process.env.FINNHUB_API_KEY) {
    try {
      const q = await fetchFinnhub(key);
      cache.set(key, { quote: q, error: null, fetchedAt: Date.now() });
      return q;
    } catch (err: any) {
      errors.push(`finnhub: ${err?.message || err}`);
    }
  }

  const message = `读取 ${key} 现价失败 (${errors.join("; ")})`;
  cache.set(key, { quote: null, error: message, fetchedAt: Date.now() });
  throw new Error(message);
}

/** Yahoo symbol search / autocomplete — crumb-free. */
export interface TickerSearchHit {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
}

export async function searchTickers(query: string): Promise<TickerSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  const errors: string[] = [];
  let json: any = null;
  for (const host of hosts) {
    const url = `https://${host}/v1/finance/search?q=${encodeURIComponent(
      q,
    )}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        errors.push(`${host} HTTP ${res.status}`);
        continue;
      }
      json = await res.json();
      break;
    } catch (err: any) {
      errors.push(`${host}: ${err?.message || err}`);
    }
  }
  if (!json) throw new Error(`yahoo-search failed (${errors.join("; ")})`);
  const quotes: any[] = Array.isArray(json?.quotes) ? json.quotes : [];
  const hits: TickerSearchHit[] = [];
  for (const q of quotes) {
    if (!q?.symbol) continue;
    // Filter down to US-listed equities & ETFs — the app's option chain
    // only works with those anyway.
    const type = String(q.quoteType || "").toUpperCase();
    if (type !== "EQUITY" && type !== "ETF") continue;
    hits.push({
      symbol: String(q.symbol).toUpperCase(),
      name: String(q.shortname || q.longname || q.symbol),
      exchange: String(q.exchDisp || q.exchange || ""),
      quoteType: type,
    });
  }
  return hits;
}
