// yahoo-queue.ts — 全局 Yahoo 请求闸门（令牌桶 + 优先级 + 429 退避）
//
// 背景：Yahoo 按 IP 做滥用检测，触发条件不是"瞬时并发高"，而是"持续、规律、
// 无人交互的高频请求"。原实现里 chain-cache 的 refresh loop 每 15min 无条件刷
// 10 个 symbol，每个 symbol 内部又串行发 7 次 options() 请求（1 次拿 expiry 列表
// + 6 次拿各到期日链），折算 ≈280 次/小时、6720 次/天，且 7×24 不停。
//
// 这个模块把 **所有** Yahoo 出站调用收敛到单一串行队列，提供三层保护：
//
//   1. 令牌桶：长期速率硬性封顶为 1 次 / MIN_GAP_MS，桶容量 BURST 允许用户
//      首次打开期权链时短暂突发（否则 7 次串行 ×6s = 42s，体验不可接受）。
//   2. 优先级：interactive（用户点的）永远排在 background（后台预热）之前，
//      且 background 必须等桶回到 BG_RESERVE 以上才放行 —— 即后台永远不吃
//      掉留给用户的突发额度。
//   3. 退避 + 熔断：识别到 429 / 401 / rate limit 后进入冷却，冷却时间指数
//      翻倍（BASE_BACKOFF_MS → MAX_BACKOFF_MS）；冷却期内 background 任务
//      直接丢弃（不排队堆积），interactive 任务等待。成功一次即重置。
//
// 所有参数可用环境变量覆盖，不改代码就能在 Railway 上调松紧。

type Priority = "interactive" | "background";

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ── 可调参数 ────────────────────────────────────────────────────
/** 令牌补充间隔 = 长期平均速率上限（默认 6s → 最多 10 次/分钟 → 600 次/小时） */
const MIN_GAP_MS = envNum("YAHOO_MIN_GAP_MS", 6000);
/** 桶容量：用户首次加载期权链能连发多少次而不被限速 */
const BURST = envNum("YAHOO_BURST", 8);
/** background 任务放行门槛：桶里至少要有这么多令牌 */
const BG_RESERVE = envNum("YAHOO_BG_RESERVE", Math.ceil(BURST * 0.6));
/** 每次调用后额外的随机抖动，避免形成"整点齐发"的机器指纹 */
const JITTER_MS = envNum("YAHOO_JITTER_MS", 1200);
/** 首次触发限流后的冷却时长 */
const BASE_BACKOFF_MS = envNum("YAHOO_BASE_BACKOFF_MS", 60 * 1000);
/** 冷却时长上限 */
const MAX_BACKOFF_MS = envNum("YAHOO_MAX_BACKOFF_MS", 15 * 60 * 1000);
/** background 队列最大长度，超出直接丢弃最旧的（防止 tick 堆积） */
const BG_QUEUE_MAX = envNum("YAHOO_BG_QUEUE_MAX", 40);

// ── 内部状态 ────────────────────────────────────────────────────
interface Task {
  run: () => Promise<unknown>;
  resolve: (v: any) => void;
  reject: (e: any) => void;
  label: string;
  priority: Priority;
}

const hiQueue: Task[] = [];
const loQueue: Task[] = [];

let tokens = BURST;
let lastRefill = Date.now();
let draining = false;

let cooldownUntil = 0;
let backoffMs = BASE_BACKOFF_MS;

// 统计信息，供 /api/yahoo/status 排查用
const stats = {
  calls: 0,
  ok: 0,
  failed: 0,
  rateLimited: 0,
  bgDropped: 0,
  lastCallAt: 0,
  lastErrorAt: 0,
  lastError: "" as string,
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function refill(): void {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed <= 0) return;
  const gained = elapsed / MIN_GAP_MS;
  if (gained <= 0) return;
  tokens = Math.min(BURST, tokens + gained);
  lastRefill = now;
}

/** 判断错误是否为限流/鉴权类（要退避），而不是"symbol 不存在"这类业务错误。 */
function isRateLimitError(err: any): boolean {
  const msg = String(err?.message || err || "");
  const status = err?.response?.status ?? err?.status;
  if (status === 429 || status === 401 || status === 403) return true;
  return /\b429\b|too many requests|rate.?limit|\b401\b|unauthorized|\b403\b|forbidden/i.test(msg);
}

function inCooldown(): boolean {
  return Date.now() < cooldownUntil;
}

function nextTask(): Task | null {
  if (hiQueue.length > 0) {
    // interactive 只要有令牌就走
    if (tokens >= 1) return hiQueue.shift()!;
    return null;
  }
  if (loQueue.length > 0) {
    // background 冷却期内不放行；且必须留足给用户的突发额度
    if (inCooldown()) {
      // 冷却期直接把 background 全部丢弃，避免解冻瞬间雪崩
      while (loQueue.length > 0) {
        const t = loQueue.shift()!;
        stats.bgDropped++;
        t.reject(new Error(`[yahoo-queue] background task dropped (cooldown): ${t.label}`));
      }
      return null;
    }
    if (tokens >= BG_RESERVE) return loQueue.shift()!;
  }
  return null;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (hiQueue.length > 0 || loQueue.length > 0) {
      refill();

      // interactive 在冷却期需要等待冷却结束
      if (hiQueue.length > 0 && inCooldown()) {
        await sleep(Math.min(cooldownUntil - Date.now(), 5000));
        continue;
      }

      const task = nextTask();
      if (!task) {
        await sleep(250);
        continue;
      }

      tokens -= 1;
      stats.calls++;
      stats.lastCallAt = Date.now();

      try {
        const result = await task.run();
        stats.ok++;
        // 成功一次即认为限流解除
        backoffMs = BASE_BACKOFF_MS;
        cooldownUntil = 0;
        task.resolve(result);
      } catch (err: any) {
        stats.failed++;
        stats.lastErrorAt = Date.now();
        stats.lastError = String(err?.message || err).slice(0, 300);
        if (isRateLimitError(err)) {
          stats.rateLimited++;
          cooldownUntil = Date.now() + backoffMs;
          console.warn(
            `[yahoo-queue] rate limited on ${task.label} → cooldown ${(backoffMs / 1000).toFixed(0)}s`,
          );
          backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
        }
        task.reject(err);
      }

      // 抖动：打散规律性，降低机器指纹特征
      if (JITTER_MS > 0) await sleep(Math.random() * JITTER_MS);
    }
  } finally {
    draining = false;
  }
}

/**
 * 把一次 Yahoo 调用交给全局闸门执行。
 *
 * @param label   日志标识，例如 "options SPY 2026-08-15"
 * @param fn      实际发请求的函数
 * @param priority "interactive" = 用户当前正在等的；"background" = 预热/定时刷新
 */
export function scheduleYahoo<T>(
  label: string,
  fn: () => Promise<T>,
  priority: Priority = "interactive",
): Promise<T> {
  // 冷却期内 background 直接拒绝，不进队列
  if (priority === "background" && inCooldown()) {
    stats.bgDropped++;
    return Promise.reject(
      new Error(`[yahoo-queue] background skipped (cooldown ${((cooldownUntil - Date.now()) / 1000).toFixed(0)}s): ${label}`),
    );
  }

  return new Promise<T>((resolve, reject) => {
    const task: Task = { run: fn as () => Promise<unknown>, resolve, reject, label, priority };
    if (priority === "interactive") {
      hiQueue.push(task);
    } else {
      // 背压：background 队列过长时丢弃最旧的
      while (loQueue.length >= BG_QUEUE_MAX) {
        const dropped = loQueue.shift()!;
        stats.bgDropped++;
        dropped.reject(new Error(`[yahoo-queue] background task dropped (queue full): ${dropped.label}`));
      }
      loQueue.push(task);
    }
    void drain();
  });
}

/** 供健康检查/调试端点使用。 */
export function yahooQueueStats() {
  refill();
  return {
    ...stats,
    tokens: Number(tokens.toFixed(2)),
    burst: BURST,
    minGapMs: MIN_GAP_MS,
    bgReserve: BG_RESERVE,
    hiQueued: hiQueue.length,
    loQueued: loQueue.length,
    cooldownRemainingMs: Math.max(0, cooldownUntil - Date.now()),
    nextBackoffMs: backoffMs,
  };
}

/** 当前是否处于限流冷却（chain-cache 用来跳过整轮刷新）。 */
export function isYahooCooling(): boolean {
  return inCooldown();
}
