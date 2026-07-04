// Central registry of the 8 single-leg (with underlying) strategies.
// Reference spot S=100 is used for any strike mentioned in copy.
// All Chinese copy is written in 老欧's "人话讲期权" voice — short lines, plain words.

export type Leg = {
  type: "call" | "put" | "stock";
  side: "long" | "short";
  K?: number; // undefined for stock
  qty: number; // per unit position; use 100 shares = 1 for stock leg
  dteOffset?: number; // days ADDED to the primary DTE (calendars/diagonals/PMCC). undefined/0 = same expiry.
};

export type StrategyDef = {
  slug: string;
  nameZh: string;
  nameEn: string;
  category:
    | "single-leg"
    | "single-leg-covered"
    | "synthetic"
    | "vertical"
    | "straddle-strangle"
    | "butterfly"
    | "condor"
    | "time-spread"
    | "collar"
    | "ratio"
    | "exotic";
  bias:
    | "bull"
    | "bear"
    | "neutral"
    | "bull-mild"
    | "bear-mild"
    | "high-vol"
    | "low-vol";
  riskProfile: {
    maxProfit: string;
    maxLoss: string;
    breakeven: string;
  };
  greekSignature: {
    delta: "+" | "-" | "±" | "0";
    gamma: "+" | "-" | "±" | "0";
    theta: "+" | "-" | "±" | "0";
    vega: "+" | "-" | "±" | "0";
  };
  legs: Leg[];
  whenToUse: string[];
  risks: string[];
  adjustments: string[];
  intuition: string;
};

export const STRATEGIES: Record<string, StrategyDef> = {
  "long-call": {
    slug: "long-call",
    nameZh: "买入看涨",
    nameEn: "Long Call",
    category: "single-leg",
    bias: "bull",
    riskProfile: {
      maxProfit: "无限（股价越高越赚）",
      maxLoss: "权利金（付出去的钱）",
      breakeven: "K + 权利金",
    },
    greekSignature: { delta: "+", gamma: "+", theta: "-", vega: "+" },
    legs: [{ type: "call", side: "long", K: 100, qty: 1 }],
    whenToUse: [
      "手里现金不多，但笃定这只票要往上冲。",
      "想用小钱押大方向——亏也就亏个权利金。",
      "财报、发布会前，赌一个向上的大动作。",
      "看好但不想扛股票下跌那份心跳。",
    ],
    risks: [
      "最常见的死法：方向对了，可惜太慢——时间把权利金啃光了。",
      "Theta 每天都在扣钱，越临近到期扣得越狠。",
      "买在高 IV，事件一过 IV 一泄，价格立马缩水。",
      "到期还在价外（S<K），这张合约直接归零。",
    ],
    adjustments: [
      "涨到位了：把它 roll 到更高的行权价，锁住一部分利润。",
      "涨太慢：临近到期前该走就走，别死等奇迹。",
      "想降成本：卖一张更高行权价的 Call，变成价差（Phase 3b）。",
    ],
    intuition:
      "买 Call 就是花一笔小钱，买一个「往上冲」的权利。赌对了，天花板很高；赌错了，最多也就赔掉这点权利金——像一张彩票，但你能算清赔率。关键不是方向，是「够不够快」：股价得在到期前涨过盈亏平衡点，否则时间会替你把钱慢慢花光。",
  },

  "long-put": {
    slug: "long-put",
    nameZh: "买入看跌",
    nameEn: "Long Put",
    category: "single-leg",
    bias: "bear",
    riskProfile: {
      maxProfit: "K − 权利金（股价跌到 0 时最大）",
      maxLoss: "权利金",
      breakeven: "K − 权利金",
    },
    greekSignature: { delta: "-", gamma: "+", theta: "-", vega: "+" },
    legs: [{ type: "put", side: "long", K: 100, qty: 1 }],
    whenToUse: [
      "看空一只票，又不想去借券做空。",
      "手里有股票，想给它买份「下跌保险」。",
      "财报前怕暴雷，用小钱对冲一段时间的风险。",
      "笃定要跌，但想把亏损锁死在权利金上。",
    ],
    risks: [
      "跌不动就是慢性失血——Theta 一天天啃。",
      "股价最多跌到 0，所以盈利有上限，不像 Call 那样无限。",
      "买在恐慌高 IV，跌是跌了，钱却没赚多少。",
      "到期股价还在 K 上方，权利金全没。",
    ],
    adjustments: [
      "跌到位了：roll 到更低行权价，把利润落袋一部分。",
      "跌太慢：到期前果断了结，别指望反向奇迹。",
      "想降成本：卖一张更低行权价的 Put，做成价差。",
    ],
    intuition:
      "买 Put 是给「下跌」下注，或者给持仓上保险。它跟买 Call 是镜像：方向朝下、亏损封顶在权利金。但记住一个物理限制——股价再惨也跌不破 0，所以你的盈利有个上限。它更常见的用法其实是「保险」：宁可花点保费,也不想半夜被一根大阴线吓醒。",
  },

  "short-call": {
    slug: "short-call",
    nameZh: "卖出看涨",
    nameEn: "Short Call（裸卖 Call）",
    category: "single-leg",
    bias: "bear-mild",
    riskProfile: {
      maxProfit: "权利金（收到的钱，封顶）",
      maxLoss: "无限（股价越涨亏越多）",
      breakeven: "K + 权利金",
    },
    greekSignature: { delta: "-", gamma: "-", theta: "+", vega: "-" },
    legs: [{ type: "call", side: "short", K: 100, qty: 1 }],
    whenToUse: [
      "笃定这票短期涨不上去，横着或阴跌最好。",
      "想赚 Theta 的钱——时间站在卖方这边。",
      "IV 高得离谱，赌它会回落，卖贵的权利金。",
      "只适合老手、且要盯盘——不是新手玩具。",
    ],
    risks: [
      "⚠️ 高风险：理论上亏损无上限，一根暴涨就能爆仓。",
      "券商要收保证金，逼空时会追缴，扛不住就被强平。",
      "遇到并购、财报暴涨这种跳空，根本来不及跑。",
      "赚的是有限的权利金，赔的可能是无限的本金——赔率极不对称。",
    ],
    adjustments: [
      "涨过来了：果断 roll up & out（更高行权价、更远到期）止血。",
      "更稳的做法：直接买 100 股把它变成备兑，掐掉无限风险。",
      "赚够 50–70% 权利金：提前平仓，别贪那最后几块钱。",
    ],
    intuition:
      "裸卖 Call 是在收「时间的租金」——赌股价涨不过某个价位，到期让合约作废，权利金全归你。听起来很爽，但代价是：你把「无限的上涨风险」揽到了自己头上。这是一笔赔率极不对称的买卖：赢一点点，输可能是天量。新手请绕道，老手也得系好安全带。",
  },

  "short-put": {
    slug: "short-put",
    nameZh: "卖出看跌",
    nameEn: "Short Put（裸卖 Put）",
    category: "single-leg",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "权利金（封顶）",
      maxLoss: "K − 权利金（股价到 0 时最大）",
      breakeven: "K − 权利金",
    },
    greekSignature: { delta: "+", gamma: "-", theta: "+", vega: "-" },
    legs: [{ type: "put", side: "short", K: 100, qty: 1 }],
    whenToUse: [
      "看这票不会大跌，横盘或小涨最理想。",
      "本来就想在更低价接货——顺便收笔权利金。",
      "IV 高时卖贵的 Put，赚时间和波动率回落的钱。",
      "赚 Theta，让时间替你打工。",
    ],
    risks: [
      "股价大跌时下行风险很大——最多亏到 (K−权利金)×100。",
      "跌破行权价就会被指派，你得按 K 价接盘。",
      "同样要占保证金，急跌时可能被追缴。",
      "赚的是小钱，扛的是一整段下跌——别在下跌趋势里卖。",
    ],
    adjustments: [
      "跌过来了：roll down & out，或者干脆认领接货。",
      "如果备好现金去接货，那就是「现金担保看跌」，更稳。",
      "赚够大部分权利金就平仓，别硬扛到到期。",
    ],
    intuition:
      "裸卖 Put 是在说：「这价我不怕跌破，真跌破我愿意接货，同时先收你一笔租金。」它跟裸卖 Call 是镜像，但风险有底——股价最惨跌到 0。核心心态是：你得真心愿意在行权价接这只票。如果只是眼馋权利金、心里其实不想接货，那这笔单迟早咬你。",
  },

  "covered-call": {
    slug: "covered-call",
    nameZh: "备兑看涨",
    nameEn: "Covered Call",
    category: "single-leg-covered",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "(K − 买股成本) + 权利金（封顶）",
      maxLoss: "买股成本 − 权利金（股价到 0）",
      breakeven: "买股成本 − 权利金",
    },
    greekSignature: { delta: "+", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "stock", side: "long", qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
    ],
    whenToUse: [
      "手里有股票，短期看它温和、不会暴涨。",
      "想给持仓「收租」——多一份权利金现金流。",
      "愿意在某个价位（K）把股票卖掉，落袋为安。",
      "横盘、慢牛行情里最舒服的收租姿势。",
    ],
    risks: [
      "封顶了收益：真要暴涨，你只能赚到 K，涨过头的都跟你无关。",
      "下跌保护很薄——只多了权利金那点缓冲垫。",
      "被指派后股票没了，可能得追高再买回。",
      "本质上还是「持股」，大跌照样疼。",
    ],
    adjustments: [
      "快涨到 K：roll up & out，抬高卖出价、继续收租。",
      "股价跌了：低位可以再卖一轮 Call，摊低成本。",
      "不想被叫走：临近到期把 Call 买回来（roll 出去）。",
    ],
    intuition:
      "备兑就是「持股 + 卖 Call」：你已经有股票，再顺手把上涨空间租出去换现金。代价是给收益装了个天花板——涨过头的钱不归你。它适合温和看多、想多一份现金流的人；本质是拿「上涨的想象空间」换「确定的权利金」。慢牛横盘最爽，一旦暴涨你会拍大腿，一旦暴跌你也照样扛。",
  },

  "protective-put": {
    slug: "protective-put",
    nameZh: "保护性看跌",
    nameEn: "Protective Put",
    category: "single-leg-covered",
    bias: "bull",
    riskProfile: {
      maxProfit: "无限（股票继续涨）",
      maxLoss: "(买股成本 − K) + 权利金",
      breakeven: "买股成本 + 权利金",
    },
    greekSignature: { delta: "+", gamma: "+", theta: "-", vega: "+" },
    legs: [
      { type: "stock", side: "long", qty: 1 },
      { type: "put", side: "long", K: 95, qty: 1 },
    ],
    whenToUse: [
      "手里有票、还想拿着，但怕这段时间有大跌。",
      "财报、大事件前，给持仓上一份「保险」。",
      "浮盈很多，想锁住利润又不想现在卖。",
      "睡不着觉的时候——花点保费换安稳。",
    ],
    risks: [
      "保险不是免费的：保费会拖累你的整体收益。",
      "没出事时，这份保费就是白花的成本。",
      "保护只到 K 以下；K 到成本之间那段还是要亏。",
      "保费会随时间衰减，保得越久越贵。",
    ],
    adjustments: [
      "股价涨了：roll up 保护线（更高 K），锁住更多利润。",
      "风险过去了：把 Put 卖掉，回收一部分残值。",
      "想省保费：卖一张更高的 Call 对冲成本（变成 collar）。",
    ],
    intuition:
      "保护性看跌 = 持股 + 买 Put，就是给你的股票买份保险。上涨空间全留着（跟裸持股一样），下跌则被 Put 兜住——最多亏到「成本 − K + 保费」。代价就是那笔保费，像车险一样：多数时候白交，真出事那天你会庆幸买了。适合舍不得卖、又怕黑天鹅的人。",
  },

  "cash-secured-put": {
    slug: "cash-secured-put",
    nameZh: "现金担保看跌",
    nameEn: "Cash-Secured Put",
    category: "single-leg-covered",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "权利金（封顶）",
      maxLoss: "(K − 权利金) × 100（股价到 0）",
      breakeven: "K − 权利金",
    },
    greekSignature: { delta: "+", gamma: "-", theta: "+", vega: "-" },
    legs: [{ type: "put", side: "short", K: 95, qty: 1 }],
    whenToUse: [
      "想买某只票，但嫌现价贵，愿意等它跌到 K 再接。",
      "备好了现金（K×100），真被指派也接得起。",
      "等的过程中顺便收一笔权利金，不白等。",
      "把「挂低价买单」变成能收租的正经策略。",
    ],
    risks: [
      "跌得比预想狠：接盘价虽是 K，账面还是亏。",
      "被指派前，这笔现金一直被占着、不能乱动。",
      "行情大涨你却没上车——踏空的机会成本。",
      "本质还是卖 Put，别在明显的下跌趋势里做。",
    ],
    adjustments: [
      "跌到 K 附近：坦然接货，然后可以接着卖 Covered Call（轮子策略）。",
      "不想接了：roll down & out 躲开指派。",
      "赚够权利金：提前平仓，落袋走人。",
    ],
    intuition:
      "现金担保看跌，就是裸卖 Put 的「乖乖版」——区别是你真备好了现金去接货。心态很简单：「这价我本来就想买，跌到就接，接不到就白赚一笔权利金。」两头都不亏心。它和 Covered Call 一前一后拼起来，就是经典的「轮子策略」：低位接货、高位收租，来回转。",
  },

  "synthetic-long": {
    slug: "synthetic-long",
    nameZh: "合成多头",
    nameEn: "Synthetic Long Stock",
    category: "synthetic",
    bias: "bull",
    riskProfile: {
      maxProfit: "无限（跟持股几乎一样）",
      maxLoss: "近似 K（股价到 0，扣净成本）",
      breakeven: "K ± 净权利金",
    },
    greekSignature: { delta: "+", gamma: "0", theta: "0", vega: "0" },
    legs: [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "put", side: "short", K: 100, qty: 1 },
    ],
    whenToUse: [
      "想复制「买 100 股」的效果，但不想立刻掏那么多本金。",
      "看多且笃定，想用期权做出接近 Delta≈1 的敞口。",
      "理解 put-call parity 后，验证「合约能拼出股票」的那个瞬间。",
      "作为单腿走向组合（Phase 3b）的过渡桥梁。",
    ],
    risks: [
      "跟持股一样：下跌几乎全额承受，别被「期权」二字骗了。",
      "卖出的那条 Put 会被指派，急跌时要按 K 接盘。",
      "要占保证金，波动大时可能被追缴。",
      "两条腿都要管，比单纯买股票复杂。",
    ],
    adjustments: [
      "想减风险：买回 Put，就退回成纯 Long Call。",
      "真想持股：让 Put 被指派，直接变成 100 股。",
      "这是通往 Phase 3b 组合的入口——理解它，价差、跨式就顺了。",
    ],
    intuition:
      "合成多头 = 买 Call + 卖 Put（同一行权价）。神奇之处在于：把这两条腿叠起来，损益曲线几乎和「持有 100 股」一模一样——这就是 put-call parity（认沽认购平价）活生生的样子。它是从「单腿」跨进「组合」的那座桥：一旦你 get 到「合约可以拼出股票」，价差、跨式、蝶式这些组合策略的门就打开了。",
  },

  // ─────────────── 垂直价差 · Vertical Spreads (4) ───────────────
  "bull-call-spread": {
    slug: "bull-call-spread",
    nameZh: "牛市看涨价差",
    nameEn: "Bull Call Spread",
    category: "vertical",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "两个行权价之间的宽度 − 净借记",
      maxLoss: "净借记（买高卖低那笔差价）",
      breakeven: "低行权价 K1 + 净借记",
    },
    greekSignature: { delta: "+", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
    ],
    whenToUse: [
      "看它会涨，但涨幅有限，不会一飞冲天。",
      "嫌单买 Call 太贵，卖一张更高的 Call 把成本压下来。",
      "愿意用「封顶收益」换「更低成本 + 更高胜率」。",
      "慢牛、震荡上行的行情最舒服。",
    ],
    risks: [
      "收益被卖出的那条腿封死了——真暴涨也只能赚到宽度。",
      "股价横着不动，两条腿一起被 Theta 磨，照样亏净借记。",
      "到期还在 K1 下方，净借记全没。",
      "两条腿的手续费是单腿的两倍，小仓位不划算。",
    ],
    adjustments: [
      "涨到位快摸到 K2：提前平仓落袋，别等最后那几毛钱。",
      "看法更乐观了：把 short 腿 roll 到更高 K，打开上方空间。",
      "方向看错：整体平掉止损，别单独留下裸 Call。",
    ],
    intuition:
      "牛市看涨价差就是「买 Call + 卖一张更高的 Call」。卖出的那条腿像一张折扣券——用它把买 Call 的成本砍掉一块，代价是收益封了顶。它把「无限但昂贵」的裸 Call，改造成「有限但便宜、胜率更高」的温和看涨工具。适合那种「我看涨，但没到梭哈相信它翻倍」的心态。",
  },

  "bear-put-spread": {
    slug: "bear-put-spread",
    nameZh: "熊市看跌价差",
    nameEn: "Bear Put Spread",
    category: "vertical",
    bias: "bear-mild",
    riskProfile: {
      maxProfit: "两个行权价之间的宽度 − 净借记",
      maxLoss: "净借记",
      breakeven: "高行权价 K2 − 净借记",
    },
    greekSignature: { delta: "-", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "put", side: "long", K: 100, qty: 1 },
      { type: "put", side: "short", K: 95, qty: 1 },
    ],
    whenToUse: [
      "看它会跌，但跌幅有限，不至于崩盘。",
      "嫌单买 Put 太贵，卖一张更低的 Put 摊成本。",
      "愿意用封顶收益换更低成本、更高胜率。",
      "温和下行、阴跌行情里的看跌工具。",
    ],
    risks: [
      "收益封顶在两个行权价的宽度里，暴跌也吃不满。",
      "跌不动就是慢性失血，Theta 一天天磨。",
      "到期还在 K2 上方，净借记全没。",
      "双倍手续费，小仓位不划算。",
    ],
    adjustments: [
      "跌到位快摸到 K1：提前平仓落袋。",
      "看法更悲观：short 腿 roll 到更低 K，打开下方空间。",
      "方向看错：整体平掉，别留裸 Put。",
    ],
    intuition:
      "熊市看跌价差是牛市看涨价差的镜像：买一张 Put + 卖一张更低的 Put。卖腿帮你把成本降下来，代价是收益封顶。它给「温和看跌」这件事一个便宜又高胜率的表达方式——你不用赌它崩盘，只要它慢慢往下挪就行。",
  },

  "bull-put-spread": {
    slug: "bull-put-spread",
    nameZh: "牛市看跌价差",
    nameEn: "Bull Put Spread（信用价差）",
    category: "vertical",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "净信用（收到的权利金，封顶）",
      maxLoss: "两个行权价的宽度 − 净信用",
      breakeven: "高行权价 K2 − 净信用",
    },
    greekSignature: { delta: "+", gamma: "±", theta: "+", vega: "-" },
    legs: [
      { type: "put", side: "short", K: 100, qty: 1 },
      { type: "put", side: "long", K: 95, qty: 1 },
    ],
    whenToUse: [
      "看它「不会跌」——横着或小涨都能赢。",
      "想收租，又怕裸卖 Put 的无底洞，买张更低的 Put 兜底。",
      "IV 偏高时卖贵的权利金，赚时间和波动率回落。",
      "想要高胜率的现金流策略。",
    ],
    risks: [
      "看错方向大跌，最多亏「宽度 − 净信用」。",
      "赢的是小钱（净信用），输的是相对大的宽度——赔率不对称。",
      "急跌时账面难看，容易手抖提前止损在最差点。",
      "占用保证金 = 最大亏损那部分。",
    ],
    adjustments: [
      "跌过来快到 K2：roll down & out，降行权价、拉长时间。",
      "赚够 50–70% 权利金：提前平仓，别贪最后几块。",
      "趋势彻底反转：果断认亏平仓，别硬扛。",
    ],
    intuition:
      "牛市看跌价差就是「卖一张 Put 收租 + 买一张更低的 Put 买保险」。它是裸卖 Put 的「安全版」——你把无限的下行风险，用一张便宜的低价 Put 封死成一个固定的坑。核心赌注是「它不会跌破我卖的那个价」。胜率高、赚得稳，但记住：赢一点点，一旦看错要吐出好几倍。",
  },

  "bear-call-spread": {
    slug: "bear-call-spread",
    nameZh: "熊市看涨价差",
    nameEn: "Bear Call Spread（信用价差）",
    category: "vertical",
    bias: "bear-mild",
    riskProfile: {
      maxProfit: "净信用（封顶）",
      maxLoss: "两个行权价的宽度 − 净信用",
      breakeven: "低行权价 K1 + 净信用",
    },
    greekSignature: { delta: "-", gamma: "±", theta: "+", vega: "-" },
    legs: [
      { type: "call", side: "short", K: 100, qty: 1 },
      { type: "call", side: "long", K: 105, qty: 1 },
    ],
    whenToUse: [
      "看它「涨不上去」——横着或小跌都能赢。",
      "想收租，但怕裸卖 Call 的无限风险，买张更高的 Call 封顶。",
      "IV 偏高时卖贵的权利金。",
      "上方有明显压力位，赌它突破不了。",
    ],
    risks: [
      "看错方向大涨，最多亏「宽度 − 净信用」。",
      "赢小钱、可能吐大钱，赔率不对称。",
      "遇到跳空暴涨（并购、财报）来不及反应。",
      "占用保证金 = 最大亏损那部分。",
    ],
    adjustments: [
      "涨过来快到 K1：roll up & out，抬行权价、拉长时间。",
      "赚够大部分权利金就平仓。",
      "趋势转多：果断认亏，别死扛。",
    ],
    intuition:
      "熊市看涨价差是牛市看跌价差的镜像：卖一张 Call 收租 + 买一张更高的 Call 封住无限风险。它把「裸卖 Call 的无底洞」改造成一个可控的固定风险。赌的是「它突破不了上方那道墙」。跟所有信用价差一样——高胜率、赚得稳，但看错就得吐好几倍出来。",
  },

  // ─────────────── 跨式 / 宽跨 · Straddle / Strangle (4) ───────────────
  "long-straddle": {
    slug: "long-straddle",
    nameZh: "买入跨式",
    nameEn: "Long Straddle",
    category: "straddle-strangle",
    bias: "high-vol",
    riskProfile: {
      maxProfit: "无限（涨跌够大都赚，涨那侧无上限）",
      maxLoss: "两张权利金之和（付出去的总成本）",
      breakeven: "K ± 总权利金（上下各一个）",
    },
    greekSignature: { delta: "±", gamma: "+", theta: "-", vega: "+" },
    legs: [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "put", side: "long", K: 100, qty: 1 },
    ],
    whenToUse: [
      "你笃定它「要动」，但不确定朝哪个方向动。",
      "财报、判决、大事件前，赌一个大波动。",
      "当前 IV 还便宜，赌它马上被吹起来。",
      "技术面憋了很久，随时要选方向突破。",
    ],
    risks: [
      "最大的敌人是「不动」——横盘时两张权利金一起蒸发。",
      "要涨/跌得够狠才回本，得同时打穿上下两个平衡点。",
      "买在事件前的高 IV，事件一过 IV Crush，方向对了也亏。",
      "Theta 双份地啃你，越临近到期越狠。",
    ],
    adjustments: [
      "一边已经大赚：可以了结盈利腿，留另一腿博反转（gamma scalp）。",
      "事件已过、IV 要泄：果断平仓，别等 IV Crush。",
      "动得不够：临近到期止损，别指望最后一天奇迹。",
    ],
    intuition:
      "买入跨式 = 同一行权价，同时买 Call 和 Put。你不押方向，你押「幅度」——只要它动得够大，哪边都行。代价是你付了双份权利金，所以「不动」是你最大的敌人：股价黏在 K 附近，两张票一起归零。它本质是做多波动率，最好在 IV 便宜、且预期马上有大新闻时下手。",
  },

  "short-straddle": {
    slug: "short-straddle",
    nameZh: "卖出跨式",
    nameEn: "Short Straddle",
    category: "straddle-strangle",
    bias: "low-vol",
    riskProfile: {
      maxProfit: "两张权利金之和（封顶）",
      maxLoss: "无限（涨那侧无底，跌那侧到 0）",
      breakeven: "K ± 总权利金",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "call", side: "short", K: 100, qty: 1 },
      { type: "put", side: "short", K: 100, qty: 1 },
    ],
    whenToUse: [
      "笃定它「不会动」——横盘、粘在某个价位。",
      "IV 高得离谱，赌事件过后波动率快速回落。",
      "收双份权利金，让时间替你打工。",
      "⚠️ 只适合老手 + 盯盘 + 有保证金余量。",
    ],
    risks: [
      "⚠️ 高风险：涨那侧亏损无上限，一根暴动就爆仓。",
      "两边都裸卖——上下任何一个方向走远都要命。",
      "保证金占用大，急剧波动时会被追缴强平。",
      "赚的是有限双份权利金，赔的可能是天量本金。",
    ],
    adjustments: [
      "一边被打穿：果断加对冲腿，把它变成铁蝶/铁鹰止血。",
      "赚够 25–50% 就跑——这策略不适合贪。",
      "IV 反而飙升：认错平仓，别硬扛 Vega 的反噬。",
    ],
    intuition:
      "卖出跨式 = 同一行权价，同时卖 Call 和 Put，收双份租金。你赌的是「它就待在这儿别动」。这是买入跨式的镜像——你成了波动率的卖方，Theta 替你赚钱。但代价极其凶险：上下两个方向都是裸卖，涨那侧根本没有天花板。收一点点租，扛的是无限风险，是期权里赔率最不对称的玩法之一。",
  },

  "long-strangle": {
    slug: "long-strangle",
    nameZh: "买入宽跨",
    nameEn: "Long Strangle",
    category: "straddle-strangle",
    bias: "high-vol",
    riskProfile: {
      maxProfit: "无限（涨那侧无上限）",
      maxLoss: "两张权利金之和",
      breakeven: "低 K1 − 总权利金 · 高 K2 + 总权利金",
    },
    greekSignature: { delta: "±", gamma: "+", theta: "-", vega: "+" },
    legs: [
      { type: "put", side: "long", K: 95, qty: 1 },
      { type: "call", side: "long", K: 105, qty: 1 },
    ],
    whenToUse: [
      "跟跨式一样赌大波动，但想更省钱。",
      "用两张价外合约，把入场成本压得更低。",
      "预期动得非常大，愿意用「更宽的平衡点」换低成本。",
      "事件前 IV 还没被完全吹起来时布局。",
    ],
    risks: [
      "两张都是价外，「打不透」的概率比跨式更大。",
      "股价要动得更狠才回本——平衡点被推得更远。",
      "横盘时两张价外权利金一起归零。",
      "IV Crush 一样会咬你。",
    ],
    adjustments: [
      "一边大赚：了结盈利腿，留另一腿博反向。",
      "IV 要泄：事件后果断平仓。",
      "动得不够：到期前止损，别死等。",
    ],
    intuition:
      "买入宽跨 = 买一张价外 Put + 一张价外 Call。它是跨式的「省钱版」：两张都买价外，成本更低，但代价是上下两道平衡点被推得更远——股价得动得更凶才能回本。选它还是选跨式，本质是在「便宜」和「更容易打穿」之间做取舍。",
  },

  "short-strangle": {
    slug: "short-strangle",
    nameZh: "卖出宽跨",
    nameEn: "Short Strangle",
    category: "straddle-strangle",
    bias: "low-vol",
    riskProfile: {
      maxProfit: "两张权利金之和（封顶）",
      maxLoss: "无限（涨那侧无底）",
      breakeven: "低 K1 − 总权利金 · 高 K2 + 总权利金",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "put", side: "short", K: 95, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
    ],
    whenToUse: [
      "赌它在一个区间里震荡、不选方向。",
      "卖两张价外收租，容错空间比跨式大。",
      "IV 高、预期回落时布局，赚波动率回归。",
      "⚠️ 老手策略，要有保证金余量和纪律。",
    ],
    risks: [
      "⚠️ 涨那侧亏损无上限，跌那侧亏到 0。",
      "看着容错大，一旦大行情来了照样两边裸卖挨打。",
      "保证金占用大，剧烈波动被追缴。",
      "赚有限租金、扛巨大风险，赔率不对称。",
    ],
    adjustments: [
      "一边被逼近：加对冲腿，转成铁鹰锁死风险。",
      "被打穿的那侧 roll out 拉长时间续命。",
      "赚够大部分权利金就跑，别贪。",
    ],
    intuition:
      "卖出宽跨 = 卖一张价外 Put + 一张价外 Call，赌股价在两个行权价之间来回震荡。它比卖出跨式「容错空间大」——中间那段安全区更宽。但本质没变：上下都是裸卖，涨那侧仍然无限风险。它是收租策略，Theta 帮你赚钱，但一场没预料的大行情就能把几个月的租金一次吃回去。",
  },

  // ─────────────── 蝶式 · Butterfly (3) ───────────────
  "long-call-butterfly": {
    slug: "long-call-butterfly",
    nameZh: "买入看涨蝶式",
    nameEn: "Long Call Butterfly",
    category: "butterfly",
    bias: "neutral",
    riskProfile: {
      maxProfit: "中间到两翼的宽度 − 净借记（S 精准落在 K2 时）",
      maxLoss: "净借记（很小的一笔）",
      breakeven: "K1 + 净借记 · K3 − 净借记（两个）",
    },
    greekSignature: { delta: "±", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "call", side: "long", K: 95, qty: 1 },
      { type: "call", side: "short", K: 100, qty: 2 },
      { type: "call", side: "long", K: 105, qty: 1 },
    ],
    whenToUse: [
      "笃定到期时股价会「钉」在中间那个价 K2 附近。",
      "想用极小的成本博一个高赔率的定点收益。",
      "横盘、低波动、预期临近到期收敛的行情。",
      "IV 偏高时布局，赌它回落 + 股价定住。",
    ],
    risks: [
      "要 S 精准落在 K2 才吃满，差一点利润就大打折扣。",
      "胜率不高——只有中间那一小段区间赚钱。",
      "四条腿手续费高，滑点也吃利润。",
      "股价跑出两翼，净借记就全没了。",
    ],
    adjustments: [
      "S 已经贴近 K2 + 快到期：提前平仓吃利润。",
      "股价偏离中心：可以整体 roll 到新的中心价。",
      "看错就认小亏——反正最大亏损本来就很小。",
    ],
    intuition:
      "看涨蝶式 = 买低 Call + 卖两张中间 Call + 买高 Call，三个等距行权价。它画出一个「帐篷」形状：股价落在中间尖顶（K2）时利润最大，跑到两翼外就归零。你付出一小笔净借记，博的是「股价到期钉在某个精确价位」的高赔率定点收益。它是纯粹的中性 + 低波动押注，赢面窄但赔率诱人。",
  },

  "iron-butterfly": {
    slug: "iron-butterfly",
    nameZh: "铁蝶式",
    nameEn: "Iron Butterfly",
    category: "butterfly",
    bias: "low-vol",
    riskProfile: {
      maxProfit: "净信用（S 精准落在中心 K 时，封顶）",
      maxLoss: "翼宽 − 净信用",
      breakeven: "中心 K ± 净信用（两个）",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "put", side: "long", K: 90, qty: 1 },
      { type: "put", side: "short", K: 100, qty: 1 },
      { type: "call", side: "short", K: 100, qty: 1 },
      { type: "call", side: "long", K: 110, qty: 1 },
    ],
    whenToUse: [
      "赌股价钉在中心价、又想「先收钱」而不是先付钱。",
      "IV 高时卖 ATM 双腿，收厚厚一笔信用。",
      "想要蝶式的定点收益，但用信用结构 + 封死风险。",
      "低波动、区间收敛的行情。",
    ],
    risks: [
      "最大盈利要 S 精准落在中心，稍偏就缩水。",
      "ATM 双卖，中心附近波动一大账面就难看。",
      "翼宽 − 净信用 就是你的最大亏损，别忽视。",
      "四条腿，手续费和滑点不小。",
    ],
    adjustments: [
      "S 贴近中心 + 赚够大部分信用：提前平仓。",
      "一侧被逼近：roll 那一侧的翼，或整体 roll 中心。",
      "波动率飙升：认错平仓，别扛 Vega。",
    ],
    intuition:
      "铁蝶式 = 在中心价同时卖 Call 和 Put（收厚租）+ 两翼各买一张远的 Call/Put（封死风险）。它是「买入蝶式」的信用版——同样赌股价钉在中心，区别是你先收一笔钱，最大亏损被两翼锁死。相比铁鹰，它的中心更集中、收的信用更多，但安全区更窄。用一笔信用，换一个定点。",
  },

  "broken-wing-butterfly": {
    slug: "broken-wing-butterfly",
    nameZh: "破翼蝶式",
    nameEn: "Broken Wing Butterfly",
    category: "butterfly",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "近翼宽度 − 净借记 / + 净信用（S 落在中心时）",
      maxLoss: "远翼那侧的宽度差 − 收到的信用（单侧风险已被压缩/清零）",
      breakeven: "看结构：常做到「上行完全无风险」",
    },
    greekSignature: { delta: "+", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 2 },
      { type: "call", side: "long", K: 115, qty: 1 },
    ],
    whenToUse: [
      "想做蝶式，但把「你不怕的那个方向」的风险清零。",
      "把远翼推得更远，常常能做成净信用——收着钱进场。",
      "温和看涨/看跌，同时对某一侧完全不担心。",
      "IV 偏高时用信用结构布局。",
    ],
    risks: [
      "你保留风险的那一侧，宽度更大、亏得更多。",
      "结构不对称，比对称蝶式更难算清盈亏。",
      "若做成净借记，方向反了照样亏借记。",
      "四条腿的成本和滑点。",
    ],
    adjustments: [
      "无风险那侧走远：安心持有，反正那边不亏。",
      "风险侧被逼近：roll 远翼或整体平仓。",
      "赚够就走，不必等 S 精准落点。",
    ],
    intuition:
      "破翼蝶式 = 把普通蝶式的一只翅膀「掰断」——把远翼往外挪，让两侧宽度不再相等。这么一挪，常常能把整个结构做成「净信用」，还能把你不担心的那个方向的风险彻底清零（比如上行无风险）。代价是：你保留风险的那一侧，坑挖得更深。它的精髓是「用不对称，换一侧的免费保护」——你把风险全押在你真正有把握的那个方向上。",
  },

  // ─────────────── 鹰式 · Condor (2) ───────────────
  "long-call-condor": {
    slug: "long-call-condor",
    nameZh: "买入看涨鹰式",
    nameEn: "Long Call Condor",
    category: "condor",
    bias: "neutral",
    riskProfile: {
      maxProfit: "K2−K1 的宽度 − 净借记（S 落在 K2~K3 之间）",
      maxLoss: "净借记",
      breakeven: "K1 + 净借记 · K4 − 净借记",
    },
    greekSignature: { delta: "±", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "call", side: "long", K: 90, qty: 1 },
      { type: "call", side: "short", K: 97, qty: 1 },
      { type: "call", side: "short", K: 103, qty: 1 },
      { type: "call", side: "long", K: 110, qty: 1 },
    ],
    whenToUse: [
      "赌股价在一个「区间」里震荡，不用精准定点。",
      "比蝶式安全区更宽——中间有一整段平台都吃满利润。",
      "横盘、低波动，但你不确定它到底停在哪个价。",
      "用小净借记博区间收益。",
    ],
    risks: [
      "利润被封在一段区间里，跑出去就归零。",
      "中间那段平台的利润比蝶式尖顶低（换来了更宽的安全区）。",
      "四条腿手续费、滑点都翻倍。",
      "到期跑出 K1~K4 之外，净借记全没。",
    ],
    adjustments: [
      "S 稳在中间平台 + 快到期：提前平仓。",
      "股价整体漂移：把结构 roll 到新区间。",
      "看错认小亏——最大亏损本来就是小净借记。",
    ],
    intuition:
      "看涨鹰式 = 四个等距行权价的 Call 组合（买最低、卖中间两张、买最高）。它像一张「桌子」而不是蝶式的「帐篷」：中间是一整段平顶平台，只要股价到期落在 K2~K3 之间都吃满利润。它用「更低的峰值利润」换「更宽的安全区」，是不想赌精准定点、只想赌大致区间的中性玩家的工具。",
  },

  "iron-condor": {
    slug: "iron-condor",
    nameZh: "铁鹰式",
    nameEn: "Iron Condor",
    category: "condor",
    bias: "low-vol",
    riskProfile: {
      maxProfit: "净信用（S 落在两个卖出行权价之间，封顶）",
      maxLoss: "任一侧翼宽 − 净信用",
      breakeven: "卖 Put K2 − 净信用 · 卖 Call K3 + 净信用",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "put", side: "long", K: 90, qty: 1 },
      { type: "put", side: "short", K: 95, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
      { type: "call", side: "long", K: 110, qty: 1 },
    ],
    whenToUse: [
      "赌股价在一个宽区间里震荡——最经典的收租玩法。",
      "卖出两侧价外腿收租，两翼各买一张封死风险。",
      "IV 高、预期回落时布局，赚 Theta + Vega 回归。",
      "想要高胜率、风险可控的中性现金流。",
    ],
    risks: [
      "看错方向大幅单边，最多亏「翼宽 − 净信用」。",
      "赢的是净信用，输的是翼宽——赔率不对称，别贪腿。",
      "两侧都要盯，任一侧被打穿都要处理。",
      "四条腿的手续费、滑点吃掉一部分利润。",
    ],
    adjustments: [
      "一侧被逼近：roll 那一侧 out（拉长时间）或收窄。",
      "赚够 50% 净信用：提前平仓，最经典的纪律。",
      "被打穿的那侧转成价差或认亏，别让它扩大。",
    ],
    intuition:
      "铁鹰式 = 一个牛市看跌价差 + 一个熊市看涨价差，左右各一组。它是「收租之王」，最经典的中性策略：赌股价在一个宽区间里晃悠，你两头收租，两翼买保险封死风险。它把卖出宽跨的「无限风险」改造成了固定的、可控的坑。胜率高、现金流稳，纪律就是「赚够一半就走、别贪那最后一口」。",
  },

  // ─────────────── 时间价差 / 日历 · Time Spreads (4) ───────────────
  "long-calendar-call": {
    slug: "long-calendar-call",
    nameZh: "看涨日历价差",
    nameEn: "Long Calendar Call Spread",
    category: "time-spread",
    bias: "neutral",
    riskProfile: {
      maxProfit: "近月到期时 S≈K 附近最大（远月还留着时间价值）",
      maxLoss: "净借记（付出去的差价）",
      breakeven: "近月到期时，K 两侧各一个（随参数变动）",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "+" },
    legs: [
      { type: "call", side: "short", K: 100, qty: 1, dteOffset: 0 },
      { type: "call", side: "long", K: 100, qty: 1, dteOffset: 30 },
    ],
    whenToUse: [
      "赌短期不动（近月快速衰减）、长期看方向。",
      "想赚「近月 Theta 衰减比远月快」这个时间差。",
      "当前 IV 偏低、预期未来 IV 上升时布局（做多 Vega）。",
      "横盘 + 你对远期有温和方向观点。",
    ],
    risks: [
      "近月到期时 S 离 K 太远，价差就塌了。",
      "IV 下降会咬你——它是净做多 Vega 的。",
      "两条腿到期日不同，比普通价差更绕。",
      "股价大幅单边跑，两条腿都不在最佳位置。",
    ],
    adjustments: [
      "近月到期 + S≈K：平掉近月，可续卖新的近月（滚动收租）。",
      "股价漂移：把结构 roll 到新的 K。",
      "IV 已经涨上来：可提前了结 Vega 利润。",
    ],
    intuition:
      "看涨日历价差 = 卖一张近月 Call + 买一张同行权价的远月 Call。核心赚的是「时间衰减的速度差」：近月的 Theta 塌得比远月快，你卖近月、留远月，赚这个差。它还净做多 Vega——IV 涨对你有利。最理想的剧本是：短期股价钉在 K 附近让近月归零，同时远月的时间价值还稳稳留着。",
  },

  "long-calendar-put": {
    slug: "long-calendar-put",
    nameZh: "看跌日历价差",
    nameEn: "Long Calendar Put Spread",
    category: "time-spread",
    bias: "neutral",
    riskProfile: {
      maxProfit: "近月到期时 S≈K 附近最大",
      maxLoss: "净借记",
      breakeven: "近月到期时 K 两侧各一个",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "+" },
    legs: [
      { type: "put", side: "short", K: 100, qty: 1, dteOffset: 0 },
      { type: "put", side: "long", K: 100, qty: 1, dteOffset: 30 },
    ],
    whenToUse: [
      "跟看涨日历一个道理，用 Put 版赚时间衰减差。",
      "赌短期钉在 K、长期偏空一点。",
      "IV 低时布局，做多 Vega。",
      "想用 Put 结构做中性 + 时间套利。",
    ],
    risks: [
      "近月到期 S 离 K 太远，价差塌。",
      "IV 下降不利（净多 Vega）。",
      "不同到期日的两条腿更难管理。",
      "单边大行情让结构失位。",
    ],
    adjustments: [
      "近月到期 + S≈K：平近月、续卖新近月滚动。",
      "股价漂移：roll 到新 K。",
      "IV 涨上来了：了结 Vega 利润。",
    ],
    intuition:
      "看跌日历价差是看涨日历的 Put 版：卖近月 Put + 买同 K 的远月 Put。逻辑完全一样——赚近月比远月衰减更快的时间差，并且净做多 Vega。用 Call 还是 Put 做日历，主要看你手边哪个更便宜、以及你对远期方向的那一点点偏好。最好的剧本同样是「短期钉住、远月留值」。",
  },

  "diagonal-call": {
    slug: "diagonal-call",
    nameZh: "看涨对角价差",
    nameEn: "Diagonal Call Spread",
    category: "time-spread",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "随参数变化（近月归零 + 远月增值时最佳）",
      maxLoss: "净借记（远月 ITM 更贵，通常是借记）",
      breakeven: "随两腿参数动态变化",
    },
    greekSignature: { delta: "+", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "call", side: "short", K: 105, qty: 1, dteOffset: 0 },
      { type: "call", side: "long", K: 95, qty: 1, dteOffset: 30 },
    ],
    whenToUse: [
      "同时押「时间」和「方向」——温和看涨。",
      "卖近月价外 Call 收租，买远月实值 Call 拿方向。",
      "想要备兑那种感觉，但用远月 Call 代替正股（更省钱）。",
      "温和上行、慢牛行情。",
    ],
    risks: [
      "两腿不同 K 又不同到期，最难算清的组合之一。",
      "暴涨时近月那张短 Call 会被逼近，压制收益。",
      "IV 变化对两腿影响不一，Vega 敞口复杂。",
      "远月 ITM Call 本身也有下行风险。",
    ],
    adjustments: [
      "近月到期归零：续卖新的近月 Call，滚动收租。",
      "股价涨过短腿 K：roll up & out 那条短腿。",
      "远月大涨：可整体了结锁定方向利润。",
    ],
    intuition:
      "看涨对角价差 = 卖一张近月价外 Call + 买一张远月实值 Call，行权价、到期都不同（所以叫「对角」）。它是日历和垂直价差的混血：既赚近月的时间衰减，又用远月实值 Call 押方向。你可以把它理解成「PMCC 的近亲」——远月 ITM Call 扮演正股的角色，近月短 Call 一轮轮收租。时间 + 方向，双押。",
  },

  "pmcc": {
    slug: "pmcc",
    nameZh: "穷人的备兑看涨",
    nameEn: "Poor Man's Covered Call",
    category: "time-spread",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "短 Call 行权价 − 长 Call 行权价 − 净借记（近似）",
      maxLoss: "净借记（买远月深实值 Call 的成本 − 收到的租）",
      breakeven: "随长 Call 成本动态变化",
    },
    greekSignature: { delta: "+", gamma: "±", theta: "±", vega: "+" },
    legs: [
      { type: "call", side: "long", K: 80, qty: 1, dteOffset: 60 },
      { type: "call", side: "short", K: 105, qty: 1, dteOffset: 0 },
    ],
    whenToUse: [
      "想做备兑收租，但买不起/不想压 100 股正股。",
      "用一张远月深度实值 Call 替代正股，资金效率翻几倍。",
      "温和看涨，边持有边卖近月 Call 收租。",
      "资金有限但想跑「轮子」的人。",
    ],
    risks: [
      "远月长 Call 会时间衰减（正股不会）——这是隐形成本。",
      "暴涨时短 Call 被逼近，收益被压，且长 Call 未必同步吃满。",
      "股价大跌，长 Call 的价值缩水比正股跌得更狠（杠杆）。",
      "两腿到期不同，管理比真备兑复杂。",
    ],
    adjustments: [
      "近月归零：续卖新近月 Call，一轮轮收租。",
      "股价涨过短 K：roll up & out 短腿。",
      "长 Call 快到期：提前 roll 到更远月，续命。",
    ],
    intuition:
      "穷人的备兑看涨（PMCC）= 买一张远月深度实值 Call（当作「便宜版的 100 股」）+ 卖一张近月价外 Call 收租。真备兑要压几万块买正股，PMCC 用一张深实值 Call 就复制了大部分 Delta，资金效率高得多。代价是那张长 Call 会时间衰减、且带杠杆。它是「没那么多本金、又想跑收租轮子」的人的解法。",
  },

  // ─────────────── 领口 · Collar (2) ───────────────
  "collar": {
    slug: "collar",
    nameZh: "领口",
    nameEn: "Collar",
    category: "collar",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "短 Call 行权价 − 买股成本 + 净权利金（封顶）",
      maxLoss: "买股成本 − 长 Put 行权价 − 净权利金（封底）",
      breakeven: "买股成本 ± 净权利金",
    },
    greekSignature: { delta: "+", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "stock", side: "long", qty: 1 },
      { type: "put", side: "long", K: 95, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
    ],
    whenToUse: [
      "手里有票，想锁住利润又不想卖掉。",
      "用卖出 Call 的租金，去补贴买 Put 的保费。",
      "大事件前给持仓上下都封边、睡个好觉。",
      "浮盈很多、只想稳稳守住的时候。",
    ],
    risks: [
      "上行被短 Call 封顶——真暴涨你只能干看着。",
      "下行虽有 Put 兜底，但 K 到成本之间那段仍会亏。",
      "被指派后股票会被叫走。",
      "两条腿都要管，且需要持有正股。",
    ],
    adjustments: [
      "股价涨到短 Call K：roll up & out，抬高上限。",
      "风险过去了：把 Put 卖掉回收残值。",
      "想调风险区间：同时挪动 Put/Call 的 K。",
    ],
    intuition:
      "领口 = 持股 + 买一张价外 Put（下方保险）+ 卖一张价外 Call（上方收租）。卖 Call 收的租，正好拿去付买 Put 的保费——于是几乎免费地给持仓上下都装上护栏。代价是上行被封了顶。它是「浮盈很多、只想守住」时最实用的姿势：把一段区间锁死，风平浪静地过大事件。",
  },

  "zero-cost-collar": {
    slug: "zero-cost-collar",
    nameZh: "零成本领口",
    nameEn: "Zero-Cost Collar",
    category: "collar",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "短 Call 行权价 − 买股成本（净成本≈0，封顶）",
      maxLoss: "买股成本 − 长 Put 行权价（封底）",
      breakeven: "≈ 买股成本（因为净权利金≈0）",
    },
    greekSignature: { delta: "+", gamma: "±", theta: "±", vega: "±" },
    legs: [
      { type: "stock", side: "long", qty: 1 },
      { type: "put", side: "long", K: 95, qty: 1 },
      { type: "call", side: "short", K: 103, qty: 1 },
    ],
    whenToUse: [
      "想要领口的保护，但一分保费都不想额外掏。",
      "调整 Call 的行权价，让收的租刚好抵掉 Put 的保费。",
      "锁住浮盈、过大事件，且要求净成本≈0。",
      "机构对冲大持仓最常用的姿势之一。",
    ],
    risks: [
      "为了做到零成本，Call 的 K 往往压得更近，上行封得更死。",
      "下行 Put 保护线以下才兜底，中间那段照亏。",
      "「零成本」是拿上涨空间换来的，不是真免费。",
      "被指派股票被叫走。",
    ],
    adjustments: [
      "想松开上限：往外挪 Call K，但可能要补一点保费。",
      "股价涨到 Call K：roll up & out。",
      "重设保护区间：同步移动两条腿的 K。",
    ],
    intuition:
      "零成本领口就是领口的「调参版」：刻意挑选 Call 和 Put 的行权价，让卖 Call 收的租≈买 Put 的保费，净成本压到几乎为零。听着完美，但天下没有免费的保险——你付出的「保费」其实是被压得更近的上限，也就是让渡了更多上涨空间。机构对冲大仓位时特别爱用它，因为账面上「不花钱」就锁住了风险区间。",
  },

  // ─────────────── 比率 / 反比率 · Ratio (3) ───────────────
  "call-ratio-spread": {
    slug: "call-ratio-spread",
    nameZh: "看涨比率价差",
    nameEn: "Call Ratio Spread",
    category: "ratio",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "K2 − K1 + 净信用（S 落在 K2 时最大）",
      maxLoss: "无限（多卖那张裸 Call 让上行无底）",
      breakeven: "下方一个 + 上方一个（上方=裸 Call 反噬点）",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "call", side: "long", K: 100, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 2 },
    ],
    whenToUse: [
      "温和看涨——涨到 K2 附近最爽，但别涨过头。",
      "卖两张 Call 的租常常能覆盖买腿，做成零成本甚至净信用。",
      "预期股价「涨一点点就停」，且 IV 偏高。",
      "愿意承担「超涨反而亏」的尾部风险。",
    ],
    risks: [
      "⚠️ 超过 K2 涨太多，多出来那张裸 Call 会让你无限亏。",
      "上方有一个「反噬平衡点」，涨过去就由盈转亏。",
      "暴涨新闻（并购、财报）能瞬间打穿。",
      "本质带一条裸腿，保证金和风险都不小。",
    ],
    adjustments: [
      "涨到 K2 附近：果断了结吃满利润，别恋战。",
      "快涨过上方平衡点：加买一张更高 Call 补成蝶式封顶。",
      "趋势要暴涨：立刻把裸腿对冲掉。",
    ],
    intuition:
      "看涨比率价差 = 买 1 张 Call + 卖 2 张更高的 Call。多卖的那一张，让你收的租更多（常能做成零成本），代价是它是「裸」的——股价温和涨到 K2 时你赚翻，可一旦涨过头，那张多出来的裸 Call 就把你拖进无限亏损。它是「我看涨，但只看涨一点点」的精确表达，赌的是「涨到位、别超涨」。",
  },

  "put-ratio-spread": {
    slug: "put-ratio-spread",
    nameZh: "看跌比率价差",
    nameEn: "Put Ratio Spread",
    category: "ratio",
    bias: "bear-mild",
    riskProfile: {
      maxProfit: "K2 − K1 + 净信用（S 落在 K1 时最大）",
      maxLoss: "很大（多卖那张裸 Put 让下行亏到 0）",
      breakeven: "上方一个 + 下方一个（下方=裸 Put 反噬点）",
    },
    greekSignature: { delta: "±", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "put", side: "long", K: 100, qty: 1 },
      { type: "put", side: "short", K: 95, qty: 2 },
    ],
    whenToUse: [
      "温和看跌——跌到 K1 附近最爽，但别崩盘。",
      "卖两张 Put 的租常能覆盖买腿，做成零成本/净信用。",
      "预期「跌一点点就止跌」，IV 偏高。",
      "愿意承担「超跌反而亏」的尾部风险。",
    ],
    risks: [
      "⚠️ 跌破下方平衡点，多出来那张裸 Put 让你巨亏（到 0）。",
      "下方一个反噬平衡点，跌过去由盈转亏。",
      "崩盘、暴雷能瞬间打穿。",
      "带裸腿，保证金和风险都大。",
    ],
    adjustments: [
      "跌到 K1 附近：果断吃满利润了结。",
      "快跌过下方平衡点：加买一张更低 Put 补成蝶式封底。",
      "要崩盘：立刻对冲裸腿。",
    ],
    intuition:
      "看跌比率价差是看涨比率的镜像：买 1 张 Put + 卖 2 张更低的 Put。多卖那张让你收更多租（常做成零成本），但它是裸的——温和跌到 K1 你赚翻，一旦跌穿头，那张裸 Put 把你拖进大亏。它是「我看跌，但只看跌一点点」的表达，赌的是「跌到位、别崩盘」。",
  },

  "call-ratio-backspread": {
    slug: "call-ratio-backspread",
    nameZh: "看涨反比率",
    nameEn: "Call Ratio Backspread",
    category: "ratio",
    bias: "high-vol",
    riskProfile: {
      maxProfit: "无限（大涨那侧无上限）",
      maxLoss: "两个行权价之间的宽度 − 净信用（S 卡在 K2 时最痛）",
      breakeven: "下方一个 + 上方一个",
    },
    greekSignature: { delta: "+", gamma: "+", theta: "-", vega: "+" },
    legs: [
      { type: "call", side: "short", K: 100, qty: 1 },
      { type: "call", side: "long", K: 105, qty: 2 },
    ],
    whenToUse: [
      "赌「要么大涨、要么干脆不动」，最怕卡在中间。",
      "常能做成净信用进场——不涨也不亏（甚至小赚）。",
      "预期一个向上的大爆发（突破、利好催化）。",
      "IV 偏低时布局，做多 Gamma + Vega。",
    ],
    risks: [
      "最痛的是 S 卡在 K2 附近——那是最大亏损点。",
      "温和上涨（刚好到 K2）反而是最差剧本。",
      "没等到大涨，Theta 会磨掉多买的那两张。",
      "要动得够猛才回本，中间那段是坑。",
    ],
    adjustments: [
      "大涨启动：安心持有，上方无限空间。",
      "卡在 K2 附近 + 快到期：提前平仓止损。",
      "迟迟不动：临近到期果断了结，别硬扛 Theta。",
    ],
    intuition:
      "看涨反比率 = 卖 1 张低 Call + 买 2 张更高的 Call，是比率价差的反向操作。它的损益图像个「打勾」：大涨那侧无限盈利，完全不动时靠净信用小赚，最怕的是股价温和涨、正好卡在你买腿的行权价 K2——那是坑底。它本质是「便宜地做多一个向上的大爆发」，赌的是「要么冲，要么躺平，就别温吞」。",
  },

  // ─────────────── 高级 · Exotic (2) ───────────────
  "jade-lizard": {
    slug: "jade-lizard",
    nameZh: "玉蜥蜴",
    nameEn: "Jade Lizard",
    category: "exotic",
    bias: "bull-mild",
    riskProfile: {
      maxProfit: "总净信用（S 在 short Put 之上、short Call 之下时封顶）",
      maxLoss: "下行较大：short Put K − 净信用（跌到 0 那侧）",
      breakeven: "下方 = short Put K − 净信用；上行无风险",
    },
    greekSignature: { delta: "+", gamma: "-", theta: "+", vega: "-" },
    legs: [
      { type: "put", side: "short", K: 95, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
      { type: "call", side: "long", K: 110, qty: 1 },
    ],
    whenToUse: [
      "想收租，但把「上行的无限风险」彻底清零。",
      "关键诀窍：让总净信用 ≥ 看涨价差的宽度，上方就永远不亏。",
      "中性偏多——不怕涨、只提防大跌。",
      "IV 高时收厚租的进阶玩法。",
    ],
    risks: [
      "下行风险仍在——跌破 short Put 会被指派、亏损放大。",
      "要精确控制信用 ≥ 看涨价差宽度，否则上方仍留小口子。",
      "三条腿，管理和手续费比单纯卖 Put 复杂。",
      "急跌行情里，本质还是卖 Put 那份痛。",
    ],
    adjustments: [
      "跌向 short Put：roll down & out，或坦然接货。",
      "赚够大部分信用：提前平仓。",
      "上行走远：安心持有，反正上方不亏。",
    ],
    intuition:
      "玉蜥蜴 = 卖一张 Put + 一个看涨价差（卖近 Call + 买远 Call）。它的精妙在于：只要你收到的总信用 ≥ 看涨价差的宽度，那么无论股价往上冲多高，你都不会亏——上行风险被结构性地清零了。于是你只需要操心一个方向：下跌。它本质是「加了上行护栏的卖 Put 收租」，用一点结构设计，换掉了裸卖那种两头担惊受怕的日子。",
  },

  "long-box-spread": {
    slug: "long-box-spread",
    nameZh: "长盒式价差",
    nameEn: "Long Box Spread",
    category: "exotic",
    bias: "neutral",
    riskProfile: {
      maxProfit: "固定 = K2 − K1（到期时无论 S 多少都一样）",
      maxLoss: "≈0（理论上是无风险套利/融资，除非价格错配）",
      breakeven: "无方向敞口——收益锁定为 K2−K1",
    },
    greekSignature: { delta: "0", gamma: "0", theta: "0", vega: "0" },
    legs: [
      { type: "call", side: "long", K: 95, qty: 1 },
      { type: "call", side: "short", K: 105, qty: 1 },
      { type: "put", side: "long", K: 105, qty: 1 },
      { type: "put", side: "short", K: 95, qty: 1 },
    ],
    whenToUse: [
      "教学用：亲手验证「期权可以拼出一笔确定现金流」。",
      "实务里几乎只当融资/借贷工具，不当方向交易。",
      "理解 put-call parity 的终极形态。",
      "看清「为什么盒式在美股基本只是变相借钱」。",
    ],
    risks: [
      "⚠️ 美式期权提前指派风险——盒式可能被拆穿（历史上有人爆仓）。",
      "手续费 + 买卖价差常常吃光那点微薄套利。",
      "利率变动影响盒式的现值。",
      "看似无风险，实操里的坑（指派、流动性）不少。",
    ],
    adjustments: [
      "一般持有到期，锁定 K2−K1。",
      "若某条腿被提前指派：立刻处理对应对冲，别裸奔。",
      "当纯融资用：比较盒式隐含利率和别处借钱成本。",
    ],
    intuition:
      "长盒式价差 = 一个牛市看涨价差 + 一个熊市看跌价差（同样的两个行权价）。神奇之处：无论到期时股价是多少，它的收益永远固定 = K2−K1，没有任何方向敞口。所以它根本不是「交易」，而是一笔用期权拼出来的确定现金流——在美股市场，它的真实用途基本就是「变相借钱/存钱」：你今天付出一个现值，到期拿回固定的 K2−K1，中间的差价就是隐含利率。它是 put-call parity 玩到极致的样子，做示教最合适，别拿它赌方向。",
  },
};

export const STRATEGY_ORDER = [
  "long-call",
  "long-put",
  "short-call",
  "short-put",
  "covered-call",
  "protective-put",
  "cash-secured-put",
  "synthetic-long",
  "bull-call-spread",
  "bear-put-spread",
  "bull-put-spread",
  "bear-call-spread",
  "long-straddle",
  "short-straddle",
  "long-strangle",
  "short-strangle",
  "long-call-butterfly",
  "iron-butterfly",
  "broken-wing-butterfly",
  "long-call-condor",
  "iron-condor",
  "long-calendar-call",
  "long-calendar-put",
  "diagonal-call",
  "pmcc",
  "collar",
  "zero-cost-collar",
  "call-ratio-spread",
  "put-ratio-spread",
  "call-ratio-backspread",
  "jade-lizard",
  "long-box-spread",
];
