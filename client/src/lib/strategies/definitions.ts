// Central registry of the 8 single-leg (with underlying) strategies.
// Reference spot S=100 is used for any strike mentioned in copy.
// All Chinese copy is written in 老欧's "人话讲期权" voice — short lines, plain words.

export type Leg = {
  type: "call" | "put" | "stock";
  side: "long" | "short";
  K?: number; // undefined for stock
  qty: number; // per unit position; use 100 shares = 1 for stock leg
};

export type StrategyDef = {
  slug: string;
  nameZh: string;
  nameEn: string;
  category: "single-leg" | "single-leg-covered" | "synthetic";
  bias: "bull" | "bear" | "neutral" | "bull-mild" | "bear-mild";
  riskProfile: {
    maxProfit: string;
    maxLoss: string;
    breakeven: string;
  };
  greekSignature: {
    delta: "+" | "-" | "±";
    gamma: "+" | "-" | "0";
    theta: "+" | "-";
    vega: "+" | "-";
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
    greekSignature: { delta: "+", gamma: "0", theta: "+", vega: "+" },
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
];
