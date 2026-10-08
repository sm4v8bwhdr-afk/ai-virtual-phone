// lib/llm-http.ts
// LLM 请求的统一 fetch 出口。所有走 buildProviderRequest 的调用点统一经它发请求：
//  - 普通 provider：浏览器直连（现状不变）；
//  - serverProxy 标记（OpenCode 网关）：改发本站 /api/llm-proxy，由服务端转发，
//    绕过 opencode.ai 未开放浏览器 CORS 的问题。
//  - 演示模式：不走网络，直接返回本地生成的假聊回复（SSE 格式），
//    不需要 API key、不花钱。明确标注为演示用途。

import type { LlmRequestPayload } from "./llm-provider-adapter";
import { isDemoModeActive } from "./settings-storage";
import { generateDemoReply } from "./demo-chat-engine";
import { ensureBianaoCharacter } from "./demo-character";
import { loadCharacters } from "./character-storage";

export type FetchLlmPayloadOptions = {
    signal?: AbortSignal;
};

export function fetchLlmPayload(
    payload: LlmRequestPayload,
    options: FetchLlmPayloadOptions = {},
): Promise<Response> {
    // ── 演示模式（假聊模式）：拦截请求，本地生成回复，不走网络 ──
    if (isDemoModeActive()) {
        return createDemoResponse(payload);
    }

    const bodyText = JSON.stringify(payload.body);
    if (payload.serverProxy) {
        return fetch("/api/llm-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: payload.url,
                headers: payload.headers,
                body: bodyText,
            }),
            signal: options.signal,
        });
    }
    return fetch(payload.url, {
        method: "POST",
        headers: payload.headers,
        body: bodyText,
        signal: options.signal,
    });
}

/**
 * 演示模式：根据请求里的用户消息，本地生成回复，
 * 伪装成 OpenAI 兼容的 SSE 流式响应返回。
 */
async function createDemoResponse(payload: LlmRequestPayload): Promise<Response> {
    const userText = extractLastUserMessage(payload.body);

    // 拿角色：优先必爱诺，找不到就用角色库第一个
    let character = ensureBianaoCharacter();
    if (!character) {
        try {
            const chars = loadCharacters();
            character = chars.find((c) => c.name === "必爱诺") ?? chars[0] ?? null;
        } catch {
            character = null;
        }
    }

    let replyText = "嘿嘿，演示模式启动成功！我是必爱诺，陪你聊天不花一分钱！";
    if (character) {
        try {
            replyText = await generateDemoReply(character, userText || "你好");
        } catch {
            // 兜底：生成失败也不抛错
            replyText = "嘿嘿，我是必爱诺，演示模式陪聊中！";
        }
    }

    const sseBody = formatAsSse(replyText);
    return new Response(sseBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
}

/** 从 OpenAI 格式请求体里提取最后一条用户消息文本 */
function extractLastUserMessage(body: Record<string, unknown>): string {
    try {
        const messages = body["messages"] as Array<{ role?: string; content?: unknown }> | undefined;
        if (!Array.isArray(messages)) return "";
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role !== "user") continue;
            const content = m.content;
            if (typeof content === "string") return content;
            if (Array.isArray(content)) {
                for (const part of content) {
                    const p = part as { type?: string; text?: string };
                    if (p && p.type === "text" && typeof p.text === "string") return p.text;
                }
            }
        }
    } catch {
        /* 忽略解析错误 */
    }
    return "";
}

/** 把纯文本包装成 OpenAI 兼容的 SSE 流（分块模拟打字机效果） */
function formatAsSse(text: string): string {
    const chunks: string[] = [];
    const CHUNK_SIZE = 6;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        const piece = text.slice(i, i + CHUNK_SIZE);
        const data = JSON.stringify({ choices: [{ delta: { content: piece }, index: 0 }] });
        chunks.push(`data: ${data}\n\n`);
    }
    chunks.push("data: [DONE]\n\n");
    return chunks.join("");
}
