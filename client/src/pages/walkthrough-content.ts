// Lao Ou narrative content for the Greeks Walkthrough and Learn article.
// Text is VERBATIM from docs/laoou-quotes.md (来源：小红书 @老欧). Do not paraphrase.

export const LAOOU_ATTRIBUTION = "— 老欧（小红书 @老欧）· 原文链接";
export const LAOOU_LINK = "#"; // 原文链接暂用 # 占位，待用户提供

export type StepGreek = "intro" | "delta" | "gamma" | "theta" | "vega" | "rho" | "synthesis";

export interface WalkStep {
  id: StepGreek;
  label: string; // step indicator label
  title: string; // full section title
  color: string; // css var reference, "" for intro/synthesis
  intro: string[]; // 精简开场 (2–3 行)
  full: string[]; // 展开完整原文
  instruction: string; // 互动实验指令 (without 👉)
  quote: string; // 金句收尾 (without ✨)
}

export const STEPS: WalkStep[] = [
  {
    id: "intro",
    label: "直觉",
    title: "直觉入门 · Intro",
    color: "",
    intro: [
      "下单的时候，最容易慌的，不是涨跌判断，而是合约栏一打开，整个人就乱了。",
      "同一个标的，几十张合约摆在眼前——到期日不一样，行权价不一样，价格也不一样。",
      "你明明是带着一个观点来的，最后却很容易变成\u201c随便挑一张差不多的先买了\u201d。",
    ],
    full: [
      "很多人做期权，先输的不是方向，而是从来没认真想过这三个问题：",
      "· 你看的是哪个标的",
      "· 你准备等多久",
      "· 你预期它走多大",
      "这三个问题，最后才会落到合约上。所以选合约不是附属动作，而是把你的判断真正落地。",
    ],
    instruction:
      "并列看两张 SPY 假想合约（ATM K=100 vs OTM K=110），同样标的涨 5%，看两张合约的收益差几倍。",
    quote: "标的不是背景板，它本身就是交易的一部分。",
  },
  {
    id: "delta",
    label: "Delta",
    title: "Delta · 价格敏感度",
    color: "var(--greek-delta)",
    intro: [
      "同一个标的，同样看涨，为什么有的合约动得快，有的动得慢？",
      "这个\u201c跟随速度\u201d，就叫 Delta。",
    ],
    full: [
      "Delta 说的，就是这个区别。虚值的合约，标的动 1 块它才动一毛；实值的合约，标的动 1 块它跟着动八九毛。",
      "越虚的期权，越偏向波动率和时间价值；越实的期权，才越像方向性交易。所以 Delta 不只是一个数字——它决定了这张合约是\u201c方向票\u201d还是\u201c波动票\u201d。",
    ],
    instruction:
      "把行权价 K 保持在 100 不变，把标的价 S 从 90 慢慢拖到 110。看 Delta 曲线上的那颗高亮点——当股票从深度虚值走到深度实值，Delta 是怎么从 0 爬到 1 的？",
    quote:
      "Delta 说的，就是这个区别。但你可能已经注意到——Delta 本身也在变。这个\u2018Delta 的变速\u2019，就是下一步的 Gamma。",
  },
  {
    id: "gamma",
    label: "Gamma",
    title: "Gamma · Delta 的加速度",
    color: "var(--greek-gamma)",
    intro: [
      "Delta 不是一个固定数字，它自己也会跑。",
      "跑得快慢——就是 Gamma。",
    ],
    full: [
      "你有没有过这种经历：早上标的涨了 2 块，你的 Call 涨了不少；下午又涨 2 块，你的 Call 突然涨得更凶。",
      "这不是错觉，这是 Delta 在膨胀。Gamma 说的就是\u201cDelta 变得多快\u201d。",
      "Gamma 越大，你手里的期权越\u201c活\u201d——但也意味着，反方向走的时候，跌得也会更凶。",
    ],
    instruction:
      "把标的价 S 在 K 附近（95 到 105）来回拖动，观察 Gamma 曲线。Gamma 的峰值在哪里？为什么远离行权价时它反而变小？",
    quote:
      "越接近行权价，你手里的期权越\u2018活\u2019。Gamma 是双刃剑——它给你加速，也给你加速摔跤。",
  },
  {
    id: "theta",
    label: "Theta",
    title: "Theta · 时间的偷钱贼",
    color: "var(--greek-theta)",
    intro: [
      "你不动，时间也在偷你钱。",
      "这个每天从你口袋里溜走的数，就是 Theta。",
    ],
    full: [
      "期权和股票最大的区别，就是它会\u201c到期\u201d。到期这件事不是最后一天才发生——它每一天都在发生。",
      "越接近到期日，权利金蒸发得越快，尤其是最后 30 天，Theta 会陡然加速。",
      "所以你会看到有些人明明看对了方向，但因为拿的是短期虚值合约，标的没在几天内动起来，钱就没了。",
    ],
    instruction:
      "把 DTE（剩余天数）从 60 天慢慢拖到 5 天，同时保持 S/K/σ 都不动。看权利金曲线是怎么塌下去的——尤其是最后 10 天，塌得有多快？",
    quote: "越虚的期权，越像和时间赛跑。你不是在赌方向，你是在赌\u2018速度\u2019。",
  },
  {
    id: "vega",
    label: "Vega",
    title: "Vega · 波动率的音量键",
    color: "var(--greek-vega)",
    intro: [
      "同样一张合约，前一天赚后一天亏，可能标的根本没怎么动——",
      "变的是 IV。这个\u201cIV 敏感度\u201d，就是 Vega。",
    ],
    full: [
      "很多新手最迷惑的一件事：明明标的涨了，我的 Call 怎么反而亏了？",
      "答案往往是 IV 崩了。财报前 IV 被吹得老高，你买进去；财报出来，方向对了，但 IV 一泄，权利金也跟着塌。",
      "这就是 IV Crush。Vega 告诉你：你这张合约，对波动率的变化有多敏感。",
    ],
    instruction:
      "把隐含波动率 σ 从 20% 拖到 50%，看权利金和 Vega 的变化。然后再拖回 20%——想象你就是那个财报后被\u201cIV Crush\u201d的人。",
    quote: "波动率不是背景音，它是主旋律。学会看 Vega，你才不会莫名其妙地亏钱。",
  },
  {
    id: "rho",
    label: "Rho",
    title: "Rho · 利率的慢变量",
    color: "var(--greek-rho)",
    intro: [
      "利率变一点，短期期权几乎没感觉；",
      "但长期期权（LEAPS），会跟着抖一下。这个抖的幅度，就是 Rho。",
    ],
    full: [
      "Rho 是五大 Greeks 里最容易被忽略的一个——因为大部分人做的是几周到几个月的合约，利率一天变几个基点，影响几乎看不见。",
      "但如果你做 1–2 年期的 LEAPS，利率环境的变化就不能忽略了。加息周期里 Call 会贵一点，Put 会便宜一点。",
    ],
    instruction:
      "把 DTE 拖到 500 天（LEAPS 场景），然后调整无风险利率 r 从 2% 到 6%，看 Rho 的量级变化。再把 DTE 拖回 30 天——Rho 是不是几乎消失了？",
    quote: "Rho 是慢变量，日常做期权不用太在意。但你要玩 LEAPS，就必须把它放进视野。",
  },
  {
    id: "synthesis",
    label: "合成",
    title: "合成 · 一张合约的\u201c性格档案\u201d",
    color: "",
    intro: [
      "五个 Greeks 合在一起，就是你这张合约的\u201c性格档案\u201d。",
      "选合约，本质上就是选一种性格。",
    ],
    full: [
      "一张深度实值的 LEAPS Call：高 Delta、低 Gamma、低 Theta、中等 Vega、有 Rho。它像股票，但省资金。",
      "一张短期 ATM Call：中 Delta、极高 Gamma、极高 Theta、高 Vega、Rho 忽略。它像一次性的高倍杠杆——赢得快，输得也快。",
      "一张远月深度虚值 Call：低 Delta、中 Gamma、中 Theta、高 Vega。它像一张\u201c波动率彩票\u201d。",
      "你要做的不是记住每个 Greek 的定义，而是学会读一张合约的\u201c性格\u201d。",
    ],
    instruction:
      "试试三个预设：\u201cLEAPS 实值\u201d、\u201c月度 ATM\u201d、\u201c周度虚值\u201d。看六联图的形态怎么在三种性格之间切换。你更喜欢哪一种？",
    quote: "选合约，就是选性格。选对合约蹦着走，选错合约虐成狗。",
  },
];

// ---- Learn article (Learn 页首篇：《人话讲期权 · 期权三要素》) ----

export const LEARN = {
  title: "为什么你 3 次看对方向，2 次都输在合约上？",
  subtitle: "文 · 老欧（小红书 @老欧） · 全文改编自\u201c期权三要素\u201d系列",
  readTag: "5 分钟阅读",
  lead:
    "下单的时候，最容易慌的，不是涨跌判断，而是合约栏一打开，整个人就乱了。同一个标的，几十张合约摆在眼前——到期日不一样，行权价不一样，价格也不一样。你明明是带着一个观点来的，最后却很容易变成\u201c随便挑一张差不多的先买了\u201d。",
  chapters: [
    {
      heading: "章节 1 · 合约不是\u201c挑一个顺眼的\u201d，而是把观点翻译出来",
      prose: [
        "你每次下单，其实要翻译的是三件事：看的是哪个标的、准备等多久、预期走多大。",
        "把这三件事想清楚，合约自然就浮出来了；想不清楚，才会在合约栏里迷路。",
      ],
    },
    {
      heading: "章节 2 · 第一步先看标的，不是先看便宜不便宜",
      prose: [
        "标的有快节奏和慢节奏之分，也有消息驱动和趋势型之分。",
        "同样一张 30DTE 的 ATM Call，放在慢趋势的 SPY 上和放在高波动的 TSLA 上，命运完全不同。",
      ],
    },
    {
      heading: "章节 3 · 第二步看时间——这件事多久会发生？",
      prose: [
        "到期日不是一个日期标签，而是你判断能不能兑现的窗口。",
        "窗口太短，方向对了也来不及；窗口太长，钱又压得太久。",
      ],
    },
    {
      heading: "章节 4 · 第三步看行权价——这张合约配不配得上你的判断",
      prose: [
        "越虚的合约越像\u201c抽奖\u201d，越实的合约越像\u201c股票替代品\u201d。",
        "行权价决定了你这张合约的性格——用下面这个 Delta × 行权价的互动，亲手感受一下。",
      ],
    },
  ],
  closingQuote:
    "所以很多人学期权，先输的不是方向，而是合约选择。而行权价，恰好就是最容易被忽略、但最能直接影响结果的那个地方。",
  signature: [
    "文 · 老欧（小红书 @老欧）· 由 OptionsLab 改编为交互式教学",
    "原文链接：[待老欧提供]",
  ],
};
