// Phase 8 · Chain page durable cache（分组 + 延迟 + 交易时段门控版）
//
// 分层缓存 for /api/chain/:symbol：
//
//   1. 内存 Map（进程内，MEM_TTL_MS）
//   2. Postgres options_snapshots 表（持久，重启不丢）
//   3. Yahoo（经 yfinance.ts → yahoo-queue.ts 全局闸门）
//
// ── 为什么要改（原实现的流量问题）─────────────────────────────
// 原 startRefreshLoop 每 15min 无条件刷新全部 10 个 symbol，每个 symbol 内部
// 又串行发 1+6=7 次 Yahoo options 调用：
//     10 × 7 = 70 次 / 15min = 280 次/小时 = 6,720 次/天，7×24 不停。
// 这个"规律、持续、与用户行为无关"的模式正是 Yahoo 判定非个人用途的特征。
//
// ── 改造后 ─────────────────────────────────────────────────────
//   · 分组轮询：WHITELIST 切成 GROUP_COUNT 组，每个 tick 只刷一组
//   · 组内错峰：同组 symbol 之间再隔 REFRESH_JITTER_MS
//   · 交易时段门控：非美东交易时段完全不刷（省掉约 70% 的量）
//   · 全部后台请求走 background 优先级，永不抢用户的额度
//   · 冷却期（Yahoo 已限流）整轮跳过
//
// 默认配置下：10 只 / 5 组 = 每 tick 2 只 × 5 次调用 = 10 次 / 15min，
// 且仅在交易时段运行 → ≈40 次/小时 × 6.5 小时 × 5 天 ≈ 1,300 次/周，
// 相较原来的 47,000 次/周下降约 97%。每只 symbol 刷新周期 = 75 分钟。

import type { ChainSnapshot } from "./yfinance";
import { getOptionChain } from "./yfinance";
import { isYahooCooling } from "./yahoo-queue";
import { storage } from "./storage";

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

// ── Tunables ────────────────────────────────────────────────────
const MEM_TTL_MS = envNum("CHAIN_MEM_TTL_MS", 30 * 60 * 1000);   // 30 min 内存 TTL
const STALE_MS = envNum("CHAIN_STALE_MS", 90 * 60 * 1000);       // Postgres 超过 90 min 才回源
const REFRESH_MS = envNum("CHAIN_REFRESH_MS", 15 * 60 * 1000);   // tick 间隔
const REFRESH_JITTER_MS = envNum("CHAIN_JITTER_MS", 45 * 1000);  // 组内 symbol 错峰
const GROUP_COUNT = envNum("CHAIN_GROUP_COUNT", 5);              // 分几组轮询
const MARKET_HOURS_ONLY = envBool("CHAIN_MARKET_HOURS_ONLY", true);
const WARMUP_ON_BOOT = envBool("CHAIN_WARMUP_ON_BOOT", true);
const WARMUP_GROUPS = envNum("CHAIN_WARMUP_GROUPS", 1);          // 启动只预热第 1 组

// Hot symbols we prewarm at startup and refresh on a timer. Extend as needed.
export const WHITELIST = [
  "SPY", "QQQ", "AAPL", "NVDA", "TSLA",
  "MSFT", "GOOGL", "META", "AMZN", "TQQQ",
] as const;

// ── 分组：round-robin 切分，保证每组内标的分散而不是连号 ──────────
function buildGroups(): string[][] {
  const groups: string[][] = Array.from({ length: GROUP_COUNT }, () => []);
  WHITELIST.forEach((sym, i) => groups[i % GROUP_COUNT].push(sym));
  return groups.filter((g) => g.length > 0);
}
const GROUPS = buildGroups();
let groupCursor = 0;

// ── 交易时段判断（美东）────────────────────────────────────────
/**
 * 美股常规交易时段 09:30–16:00 ET。这里放宽到 09:00–16:30，
 * 让开盘前和收盘后各留一次刷新，覆盖开盘跳空和收盘定价。
 */
export function isUsMarketWindow(now: Date = new Date()): boolean {
  if (!MARKET_HOURS_ONLY) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return false;

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return true; // 解析失败就别拦
  const mins = hour * 60 + minute;
  return mins >= 9 * 60 && mins <= 16 * 60 + 30;
}

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
 *
 * @param priority "interactive" = 用户正在等；"background" = 定时刷新/预热。
 *                 background 在全局闸门里排在后面，且限流冷却期直接放弃。
 */
export async function getChainCached(
  symbol: string,
  priority: "interactive" | "background" = "interactive",
): Promise<ChainSnapshot> {
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

  // 2.5 限流冷却中：能给旧数据就给旧数据，不要再去撞 Yahoo
  if (isYahooCooling() && row) {
    const snap = parseSnapshot(row.payload);
    if (snap) {
      console.warn(`[chain-cache] cooling — serving stale ${key} (age ${((now - Number(row.fetchedAt)) / 1000).toFixed(0)}s)`);
      return snap;
    }
  }

  // 3. Yahoo (with stale-if-error fallback)
  try {
    const fresh = await getOptionChain(key, priority);
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

/** 刷新一个分组：组内 symbol 之间再错峰 REFRESH_JITTER_MS。 */
function refreshGroup(group: string[], tag: string): void {
  group.forEach((sym, i) => {
    setTimeout(() => {
      if (isYahooCooling()) {
        console.warn(`[chain-cache] ${tag} skip ${sym} (yahoo cooling)`);
        return;
      }
      mem.delete(sym); // 强制越过内存层，走 Postgres/Yahoo
      getChainCached(sym, "background")
        .then((snap) => {
          console.log(`[chain-cache] ${tag} ${sym} spot=$${snap.spot.toFixed(2)}`);
        })
        .catch((err) => {
          console.warn(`[chain-cache] ${tag} ${sym} failed: ${err?.message || err}`);
        });
    }, i * REFRESH_JITTER_MS);
  });
}

/**
 * Best-effort prewarm at boot. Never throws, never blocks.
 * 只预热 WARMUP_GROUPS 组（默认 1 组 = 2 只），其余靠定时轮询和用户访问按需加载。
 */
export async function warmupWhitelist(): Promise<void> {
  if (!WARMUP_ON_BOOT) {
    console.log("[chain-cache] warmup disabled (CHAIN_WARMUP_ON_BOOT=false)");
    return;
  }
  if (!isUsMarketWindow()) {
    console.log("[chain-cache] warmup skipped — 非美股交易时段");
    return;
  }
  const n = Math.min(WARMUP_GROUPS, GROUPS.length);
  console.log(
    `[chain-cache] warmup start (${n}/${GROUPS.length} 组, 共 ${GROUPS.slice(0, n).flat().length} 只)`,
  );
  for (let g = 0; g < n; g++) {
    // 组与组之间也拉开距离
    setTimeout(() => refreshGroup(GROUPS[g], `warmup g${g}`), g * GROUPS[g].length * REFRESH_JITTER_MS);
  }
  groupCursor = n % GROUPS.length;
}

/**
 * Periodic refresh so hot tickers stay warm even if no user requests them.
 * 每个 tick 只刷一组（轮转），且仅在交易时段。非阻塞，错误只记日志。
 */
let refreshTimer: NodeJS.Timeout | null = null;
export function startRefreshLoop(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    if (!isUsMarketWindow()) {
      // 非交易时段静默跳过（不打日志，否则一天几百行噪音）
      return;
    }
    if (isYahooCooling()) {
      console.warn("[chain-cache] tick skipped — yahoo 限流冷却中");
      return;
    }
    const group = GROUPS[groupCursor];
    const tag = `refresh g${groupCursor}`;
    console.log(`[chain-cache] tick → ${tag} [${group.join(", ")}]`);
    refreshGroup(group, tag);
    groupCursor = (groupCursor + 1) % GROUPS.length;
  }, REFRESH_MS);

  const cyclMin = (REFRESH_MS * GROUPS.length) / 60000;
  console.log(
    `[chain-cache] refresh loop started — ${GROUPS.length} 组 / 每 ${REFRESH_MS / 60000} 分钟一组 ` +
    `→ 每只 ${cyclMin} 分钟刷新一次；交易时段门控=${MARKET_HOURS_ONLY}`,
  );
}

/** 调试用：当前分组与轮转状态。 */
export function chainCacheStats() {
  return {
    groups: GROUPS,
    groupCursor,
    refreshMs: REFRESH_MS,
    memTtlMs: MEM_TTL_MS,
    staleMs: STALE_MS,
    marketHoursOnly: MARKET_HOURS_ONLY,
    inMarketWindow: isUsMarketWindow(),
    memKeys: Array.from(mem.keys()),
  };
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
