/**
 * Phase 1: 意图提取器
 *
 * 从消息列表中提取用户+AI 的非工具文本，调用 LLM 生成意图总结。
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SmartCompactConfig, LLMCaller } from "./types.js";
import { INTENT_SYSTEM_PROMPT, INTENT_USER_PROMPT } from "./prompts.js";

/**
 * 从消息列表中提取非工具文本（user 的纯文本 + assistant 的非 toolCall/thinking 文本）
 */
export function extractNonToolText(
	messages: AgentMessage[],
	config: SmartCompactConfig,
): string {
	const parts: string[] = [];

	for (const msg of messages) {
		if (msg.role === "user") {
			const text = extractTextFromContent(msg.content);
			if (text) parts.push(`[用户]: ${text}`);
		} else if (msg.role === "assistant") {
			const text = extractAssistantText(msg, config);
			if (text) parts.push(`[AI]: ${text}`);
		}
		// toolResult、bashExecution 等角色跳过
	}

	return parts.join("\n\n");
}

/**
 * 从 assistant 消息中提取非工具文本（跳过 thinking 块和 toolCall 块）
 */
function extractAssistantText(
	msg: AgentMessage,
	config: SmartCompactConfig,
): string {
	if (!Array.isArray(msg.content)) {
		if (typeof msg.content === "string") return msg.content;
		return "";
	}

	const texts: string[] = [];
	for (const block of msg.content as any[]) {
		if (block.type === "text" && block.text) {
			texts.push(block.text);
		}
		// 跳过 thinking、toolCall、toolResult 等块
	}

	return texts.join("\n");
}

/**
 * 从 content 中提取纯文本
 */
function extractTextFromContent(content: any): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const texts: string[] = [];
	for (const block of content as any[]) {
		if (block.type === "text" && block.text) {
			texts.push(block.text);
		}
	}
	return texts.join("\n");
}

/**
 * 调用 LLM 生成意图总结
 */
export async function summarizeIntent(
	conversation: string,
	previousSummary: string | undefined,
	callLLM: LLMCaller,
	signal?: AbortSignal,
): Promise<string> {
	const userPrompt = INTENT_USER_PROMPT
		.replace("{previousSummary}", previousSummary ?? "(无)")
		.replace("{conversation}", conversation);

	const result = await callLLM(INTENT_SYSTEM_PROMPT, userPrompt, signal);
	return result.trim();
}
