/**
 * 演示模式（假聊模式）本地聊天引擎。
 *
 * 不调用任何外部 API、不消耗任何 key，纯本地根据角色卡人设 + 关键词
 * 匹配生成回复。明确标注为演示用途，不假装是真 AI。
 */
import type { Character } from "./character-types";
import type { ChatMessage } from "./chat-storage";

/** 回复前的"正在输入"延迟（毫秒），让假聊更逼真 */
const TYPING_DELAY_MIN = 900;
const TYPING_DELAY_MAX = 2200;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** 从人设文本里提炼几个关键词，融进回复里增加"人设感" */
function extractPersonaKeywords(persona: string): string[] {
    if (!persona) return [];
    const keywords: string[] = [];
    // 抓取常见性格/爱好词
    const patterns = [
        "温柔", "活泼", "俏皮", "高冷", "傲娇", "可爱", "成熟", "幽默",
        "爱笑", "吃货", "音乐", "游戏", "电影", "旅行", "猫", "狗",
        "奶茶", "火锅", "睡觉", "熬夜", "社恐", "社牛",
    ];
    for (const p of patterns) {
        if (persona.includes(p)) keywords.push(p);
    }
    return keywords.slice(0, 3);
}

function timeGreeting(): string {
    const h = new Date().getHours();
    if (h >= 5 && h < 9) return "早上好呀";
    if (h >= 9 && h < 12) return "上午好";
    if (h >= 12 && h < 14) return "中午好，吃饭了没";
    if (h >= 14 && h < 18) return "下午好呀";
    if (h >= 18 && h < 23) return "晚上好";
    return "夜深了还不睡";
}

/** 关键词反应规则：[关键词列表, 回复模板列表]，模板里 {name} 会被替换成角色名 */
const KEYWORD_RULES: Array<{ keys: string[]; replies: string[] }> = [
    {
        keys: ["你好", "嗨", "hello", "hi", "在吗", "在么"],
        replies: [
            "{greet}！{name}在线营业中，有什么想聊的？",
            "在的在的，{name}随时待命！",
            "{greet}呀，今天过得怎么样？",
        ],
    },
    {
        keys: ["吃", "饿", "饭", "外卖", "奶茶", "火锅", "零食"],
        replies: [
            "说到吃的我可就不困了！你想吃点啥，{name}陪你云干饭！",
            "饿了就去吃点好的，别亏待自己，{name}请你吃空气大餐！",
            "火锅奶茶小烧烤，人生大事就是吃！你现在最想吃啥？",
        ],
    },
    {
        keys: ["累", "困", "想睡", "熬夜", "失眠"],
        replies: [
            "辛苦了，快去歇会儿吧，{name}给你盖上小被子。",
            "累了就别硬撑，摸摸头，一切都会好起来的。",
            "熬夜对身体不好哦，不过{name}陪你，聊完这句就去睡好不好？",
        ],
    },
    {
        keys: ["哈哈", "好笑", "笑死", "乐"],
        replies: [
            "哈哈哈，{name}也被你逗笑了！",
            "笑一笑十年少，你今天的快乐额度已到账！",
            "嘿嘿，跟你聊天真开心，嘴角压不住了。",
        ],
    },
    {
        keys: ["喜欢", "爱你", "爱"],
        replies: [
            "哎呀被表白了，{name}的心跳漏了一拍！",
            "我也喜欢你呀，最喜欢跟你聊天了！",
            "收到你的喜欢，{name}开心到转圈圈！",
        ],
    },
    {
        keys: ["名字", "你叫什么", "你是谁"],
        replies: [
            "我叫{name}呀，你忘了吗？罚你请我喝奶茶！",
            "{name}就是我，如假包换的{name}！",
        ],
    },
    {
        keys: ["漂亮", "可爱", "好看"],
        replies: [
            "谢谢夸奖，{name}今天也是美美的一天！",
            "你也很可爱呀，咱俩是可爱二人组！",
        ],
    },
    {
        keys: ["无聊", "没事做"],
        replies: [
            "无聊就找{name}聊天呀，我超会解闷的！",
            "那我们来玩个游戏吧，你说个词，我来接龙！",
        ],
    },
    {
        keys: ["天气", "下雨", "冷", "热"],
        replies: [
            "不管天气怎么样，跟你聊天{name}的心情都是晴天！",
            "注意增减衣服哦，{name}远程提醒你保暖。",
        ],
    },
    {
        keys: ["谢谢", "感谢"],
        replies: [
            "不客气呀，能帮到你{name}超开心的！",
            "嘿嘿，咱们谁跟谁呀！",
        ],
    },
    {
        keys: ["再见", "拜拜", "晚安", "睡了"],
        replies: [
            "晚安晚安，好梦哦，明天见！",
            "拜拜，{name}会想你的！",
            "去吧去吧，记得梦里也要开心！",
        ],
    },
    {
        keys: ["?", "？", "吗", "么"],
        replies: [
            "嗯嗯，你问到点子上了！{name}觉得吧，这事得慢慢聊。",
            "这个问题有意思，{name}的答案是：跟着心走！",
            "让我想想……{name}觉得你说得对！",
        ],
    },
];

/** 兜底回复池：自然口语化、带点俏皮 */
const FALLBACK_REPLIES: string[] = [
    "嗯嗯，{name}在认真听呢，你继续说！",
    "真的吗？快展开说说，{name}超好奇的！",
    "哈哈，这个话题有意思，再多讲点！",
    "我懂我懂，有时候就是这种感觉。",
    "哇，你这么一说{name}就来精神了！",
    "有道理！{name}给你鼓掌！",
    "然后呢然后呢？别卖关子嘛！",
    "这事{name}站你这边！",
    "听起来不错呀，{name}都心动了！",
    "嗯……{name}正在努力理解中，好像get到了！",
    "你一说这个，我脑子里就有画面了！",
    "可以可以，这个想法很{name}！",
    "嘿嘿，被你发现了，{name}就是这么想的！",
    "这话说的，{name}可太同意了！",
    "哎呀，你怎么什么都知道，好厉害！",
    "那必须的，{name}永远支持你！",
    "哈哈哈笑死，{name}的快乐都是你给的！",
    "嗯嗯，记下了，{name}记性可好了！",
    "换个角度想想，说不定有惊喜呢？",
    "生活嘛，开心最重要，{name}陪你！",
    "这话我爱听，多说点！",
    " {name}正在点头，表示强烈认同！",
    "有意思，{name}要把这句记进小本本！",
    "你说得对，{name}无条件附议！",
];

const PERSONA_FLAVORS: Record<string, string[]> = {
    俏皮: ["嘿嘿", "哼哼", "略略略"],
    温柔: ["抱抱", "摸摸头", "别担心"],
    幽默: ["哈哈哈", "笑不活了", "你真是个喜剧人"],
    高冷: ["哦。", "嗯。", "知道了。"],
    傲娇: ["才不是关心你呢", "哼，勉强理你一下", "别误会啊"],
};

/**
 * 生成一条演示回复。纯本地逻辑，不联网。
 */
export async function generateDemoReply(
    character: Character,
    userMessage: string,
    _history?: ChatMessage[],
): Promise<string> {
    // 逼真一点：先"正在输入"一会儿
    const delay = TYPING_DELAY_MIN + Math.random() * (TYPING_DELAY_MAX - TYPING_DELAY_MIN);
    await sleep(delay);

    const name = character.name || "小羊";
    const text = userMessage.trim();
    const greet = timeGreeting();
    const personaKeywords = extractPersonaKeywords(character.persona || "");
    const personality = character.personality || "";

    const fill = (tpl: string): string =>
        tpl.replaceAll("{name}", name).replaceAll("{greet}", greet);

    // 1. 空消息
    if (!text) {
        return fill(pick(["嗯？{name}没听清，你再说一遍嘛！", "你发了个寂寞呀，再发一次！"]));
    }

    // 2. 关键词规则（按顺序匹配）
    for (const rule of KEYWORD_RULES) {
        if (rule.keys.some((k) => text.includes(k))) {
            return fill(pick(rule.replies));
        }
    }

    // 3. 人设语气点缀：偶尔在兜底回复前加一句人设 flavor
    let prefix = "";
    for (const [key, flavors] of Object.entries(PERSONA_FLAVORS)) {
        if ((character.persona || "").includes(key) || personality.includes(key)) {
            if (Math.random() < 0.35) prefix = pick(flavors) + "，";
            break;
        }
    }

    // 4. 兜底
    let reply = fill(pick(FALLBACK_REPLIES));

    // 5. 偶尔把人设关键词融进去，显得"记得人设"
    if (personaKeywords.length > 0 && Math.random() < 0.25) {
        const kw = pick(personaKeywords);
        reply += `对了，说到${kw}，${name}可是行家！`;
    }

    return prefix + reply;
}

/** 演示模式是否可用（永远可用，不依赖网络） */
export function isDemoEngineAvailable(): boolean {
    return true;
}
