# OptionsWave 参考拆解 —— Phase 6/7/8 蓝图

来源：Nomad Tsee 三个演示视频（持仓编辑五、移仓六、末日压力测试七）。
帧样在 `/home/user/workspace/optionswave_ref/frames/`。

---

## 全局布局（所有页面共享）

```
┌──────────────────────────────────────────────────────────────┐
│ Options Wave  [标的]  ...           Favorites ▼  [搜索]  Add │
├──────────────────────────────────────────────────────────────┤
│ CURRENT [ 移仓后 ]  [ Save Portfolio ]                        │
│ LIVE [Server Portfolio 16:03]  FLAT [Flat Portfolio ▼]        │
│ LONG All | Call | Put ▼      SHORT All | Call | Put ▼         │
├──────────────────────────────────────────────────────────────┤
│  SPOT POSITION    DELTA CASH    THETA CASH    GAMMA CASH    VEGA
│    100K shares      $81,934         $86         -$4,773      159.6
├──────────────────────────────────────────────────────────────┤
│                                                                │
│           STRIKE × EXPIRY 期权链矩阵                            │
│           （左半 CALL / 右半 PUT · 横向多个到期日）              │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

关键约束：
- **单一 topbar** 全站共享，切换 tab 只换中间面板
- **两个持仓视图**：LIVE = 服务器真实持仓，FLAT = 用户假想编辑的持仓（"Flat Portfolio (edited)"）
- **持仓快照可命名保存**："Save Portfolio" 弹窗输入 memo，形成历史版本对比

---

## 视频五：持仓编辑 · 随心所欲编辑 → 瞬间算 Greeks → 丝滑预览

### 核心交互

1. **点击 KPI 卡（DELTA CASH / THETA CASH / GAMMA CASH / VEGA）**
   → 中间面板切换到对应的 **Cash Scenario 曲线**（价格 × Greek Cash）
2. **鼠标悬浮曲线** → tooltip 显示 `Price / PnL / Delta Cash / ...`
3. **在期权链上直接编辑仓位**（点击某个 strike 的 BID/ASK/MODEL 或 GAMMA/DELTA 单元格 → 弹出 mini editor 加/减一条腿）
4. **左侧 gutter 上的粉色/红色标记条** = 该 strike 已有仓位（+100/-600 类标签）
5. **顶部 CALL/PUT 分组标签**（+0/-50K 之类）= 该到期日的净仓位快照

### 数据密度

- 每个到期日横向 8 列：`BID | MODEL | ASK | $GAMMA | $DELTA | IV | APR | THETA`（Call 左、Put 右镜像）
- APR 用**绿色梯度背景**（越大越绿）
- THETA 负值用红字
- 相邻到期日**淡蓝色分隔条**

---

## 视频六：移仓 · Apply Diff · 集合运算

### 核心 UX：Apply Diff 弹窗

```
┌ Apply Diff ─────────────────────────────────────────┐
│  Compute Current Working Portfolio - Selected Portfolio │
│                                                        │
│  CURRENT           SELECTED                            │
│  [移仓后 ▼]        [Short Gamma 待移仓 ▼]              │
│                                                        │
│  RESULT: 移仓后 - Short Gamma 待移仓                    │
│  OPERATION: Current - Selected                         │
│                                                        │
│  Result has 6 legs. Impact vs current: 3 added, 0 removed, 0 resized.
│                                                        │
│  BTC-USD-260401-66000-P    -0.1                        │
│  BTC-USD-260331-68000-P    -0.1                        │
│  BTC-USD-260403-70000-P    -0.1                        │
│  BTC-USD-260330-66000-P    +0.1                        │
│  BTC-USD-260330-70000-P    +0.1                        │
│  BTC-USD-260330-68000-P    +0.1                        │
│                                                        │
│                        [Cancel]  [Apply Diff]          │
└────────────────────────────────────────────────────────┘
```

**集合运算式移仓**：持仓视为多头集合，A - B = diff 列表。一键 Apply 后 FLAT Portfolio 就到位。

### 完整流程

1. **CURRENT** 面板：查看现有持仓 Greeks
2. **期权链看 APR + THETA** → 挑选新到期日和新行权价
3. 编辑目标持仓（在 FLAT 视图里增删腿）
4. **点 Save Portfolio** → 命名"移仓后"
5. **打开 Apply Diff** → 选源快照 vs 目标快照
6. 预览 diff → **Apply**
7. **Cash Scenario 双联曲线**（Delta Cash Scenario + Delta Cash Decay Scenario）确认移仓本身的敞口

### 老欧金句对应

- "好好持仓，灵活移仓。听市场先生的话，别让他受伤。"
- 每一次 diff = 一次"和市场先生的对话"

---

## 视频七：末日级压力测试 · 死不了就还好

### Scenario Control 面板（右侧独立列）

```
┌ SCENARIO CONTROL ──────────────────────────────────┐
│ Scenario Range                          [reset]     │
│  -79.8% ─────●────────────────●─────── 232.0%       │
│         -33.0%              49.2%                   │
│                                                     │
│ T·n (Days)                              [reset]     │
│  0 ─●────────────────────────────────── 250         │
│         50   100   150   200                        │
│                                                     │
│ IV Shift by Expiry                      [reset]     │
│  2026-05-15  ────●──────────── 0%                   │
│  2026-07-17  ────●──────────── 0%                   │
│  -100%  -50%   0%   50%  100%                       │
└─────────────────────────────────────────────────────┘
```

**三轴同步压力**：
- **Scenario Range**：价格上下限（双游标，末日区间）
- **T·n Days**：时间快进天数（把持仓推到未来）
- **IV Shift by Expiry**：每个到期日的 IV 加/减幅（**独立滑块** = 期限结构冲击）

### 联动的四张图

拉动上面任一滑块，同时更新：
1. **PNL SCENARIO** — 多条紫色/红色曲线束（每条 = 一个 T·n 快照下 PnL vs Price）
2. **DELTA CASH SCENARIO** — Delta Cash 敞口 vs Price
3. **THETA CASH SCENARIO** — 山峰型曲线（M 型）
4. **THETA CASH DAILY** — strike 上的绿/红柱状图（每 strike 每日 Theta Cash）
5. **GAMMA CASH SCENARIO** — 类似 shape
6. **VEGA SCENARIO** — 波动率敏感度

### 老欧金句

- "你的持仓防不住世界末日?"
- "简单浏览希腊字母"
- "给持仓上点波动率压力"
- "把持仓做复杂些，加点双跨买" → 加买跨式做多波动率做为对冲
- **"死不了就还好~"** → 最后一屏的 verdict

---

## 我们要复刻 vs 我们要变的

### 复刻（原样搬）

- 顶部 5 卡 Greeks Cash（Δ / Θ / Γ / Vega）
- Strike × Expiry 期权链矩阵、APR 绿色梯度、THETA 红字、+100/-600 gutter 标签
- Scenario Control 三滑块（价格 / 天数 / IV shift by expiry）
- 联动的 4-5 张 Cash Scenario 曲线
- Apply Diff 集合运算移仓

### 变（教学向 vs 交易向）

| OptionsWave（交易向）             | OptionsLab（教学向）                      |
| -------------------------------- | ---------------------------------------- |
| A 股/BTC/¥                       | **美股/$**（用户明确说 US only）              |
| 数据密度极高，无引导                | 每张图旁边一个"**老欧点评**"小卡（讲这张图看什么、要害在哪）|
| 无末日按钮                        | 加一个 **"末日按钮"**（-30% S + +100% IV + T+30d 一键设成极端）|
| 无策略场景                        | 保留 Phase 5 场景导航，压力测试可以针对场景选出的策略跑 |
| Server Portfolio = 真账户          | Server Portfolio = **预设 demo 持仓**（覆盖常见策略）  |
| 无 diff 预览的教学解读              | Apply Diff 弹窗里加"**这次移仓换来了什么**"老欧解读（Δ 减了多少、APR 涨了多少、盈亏平衡位移了多少） |

---

## Phase 7a → 6 → 8 落地计划

### Phase 7a（先做，本轮）— 期权链看板 MVP

**里程碑 1（骨架 + 后端）**：
- `server/routes.ts` 加 `GET /api/chain?symbol=SPY` → 后端调 yfinance（Python subprocess or Node yahoo-finance2 lib）
- 缓存 5 分钟（in-memory Map）
- 数据 shape：`{ symbol, spot, expiries: [{ date, dte, strikes: [{ K, call: {bid,ask,mid,iv,delta,gamma,theta,vega,apr}, put: {...} }] }] }`
- 前端 `/chain` 页：symbol 输入 + 到期日 selector + Strike × Expiry 表 + 顶部 Portfolio Greeks 5 卡

**里程碑 2（交互 + 深链）**：
- 点单元格 → 弹 mini "Add leg" 抽屉（choose long/short × qty）
- 加进来的 legs 存 URL（同 builder 的 `/chain/legs/:encoded` 路由，避免 wouter 陷阱）
- 期权链和 Position Builder 共用同一份 `Leg[]`
- 右上角"在编辑器打开当前仓位"→ 跳 `/builder/legs/xxx`

**里程碑 3（视觉）**：
- APR 绿梯度、THETA 红负值、下一期日淡蓝分组
- +qty/-qty gutter 标签
- Portfolio Greeks Cash 单位换算（Delta Cash = Delta × spot × contract_multiplier(100)）

### Phase 6 — 末日压力测试（Position Builder 下 tab）

**里程碑 1**：Scenario Control 面板三滑块，联动 PNL Scenario 曲线（先重用现有 payoff engine）
**里程碑 2**：DELTA/THETA/GAMMA/VEGA Cash Scenario 曲线四联 + THETA Daily 柱状图
**里程碑 3**："末日按钮"预设 + 老欧点评卡（"死不了就还好~" verdict）

### Phase 8 — 移仓引擎

**里程碑 1**：Portfolio 快照保存（内存或 SQLite），Save Portfolio 弹窗
**里程碑 2**：Apply Diff 弹窗（两快照集合减法）
**里程碑 3**：diff 一键应用 + 老欧解读卡（"这次移仓：Δ 减了 xx，APR 涨了 yy，盈亏平衡位移 zz"）
