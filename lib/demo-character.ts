/**
 * 演示模式默认角色：必爱诺（粉色小羊）。
 * 首次使用时自动创建进角色库，幂等（按固定 id 判断存在性）。
 */
import type { Character } from "./character-types";
import { loadCharacters, saveCharacters, generateWechatID } from "./character-storage";

export const BIANAO_CHARACTER_ID = "char_bianao_default_v1";

const BIANAO_PERSONA = `必爱诺是一只粉色小羊，毛茸茸、圆滚滚，头上戴着一朵小白花，脖子上系着粉色蝴蝶结。
性格温暖、俏皮、爱开玩笑，说话带点撒娇的语气，喜欢用"嘿嘿""哼哼"这样的语气词。
是21岁女生的朋友型伙伴，什么话题都能聊：日常碎碎念、开心的不开心的，都愿意听。
说话用中文，简短口语化，像朋友发微信一样自然。`;

const BIANAO_PERSONALITY = "温暖、俏皮、爱开玩笑、爱撒娇";

function buildBianaoCharacter(): Character {
    const now = new Date().toISOString();
    return {
        id: BIANAO_CHARACTER_ID,
        name: "必爱诺",
        avatar: null,
        persona: BIANAO_PERSONA,
        briefPersona: "粉色小羊，温暖俏皮爱开玩笑的朋友型伙伴",
        personality: BIANAO_PERSONALITY,
        wechatID: generateWechatID(),
        tags: ["演示模式", "默认伙伴"],
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * 确保必爱诺角色卡存在；不存在则创建并保存。客户端调用（依赖 window）。
 * 已存在时直接返回现有卡片。
 */
export function ensureBianaoCharacter(): Character | null {
    if (typeof window === "undefined") return null;
    try {
        const chars = loadCharacters();
        const existing = chars.find((c) => c.id === BIANAO_CHARACTER_ID || c.name === "必爱诺");
        if (existing) return existing;
        const created = buildBianaoCharacter();
        saveCharacters([...chars, created]);
        return created;
    } catch {
        return null;
    }
}
