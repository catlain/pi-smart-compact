/**
 * 增强版 serializeConversation
 *
 * 与 pi 内置版本的区别：
 * - 截断 thinking 内容（pi 不截断，导致超长 session serialize 后超 200k）
 * - 截断 tool call arguments（pi 不截断）
 * - 可配置截断长度
 */
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import type { SmartCompactConfig } from "./types";

/**
 * 预处理单条消息，截断大内容
 */
function preprocessMessage(msg: AgentMessage, config: SmartCompactConfig): AgentMessage {
	switch (msg.role) {
		case "assistant": {
			const content = (msg as any).content;
			if (!Array.isArray(content)) return msg;
			return {
				...msg,
				content: content.map((block: any) => {
					if (block.type === "thinking" && block.thinking && block.thinking.length > config.thinkingTruncateChars) {
						return { ...block, thinking: block.thinking.slice(0, config.thinkingTruncateChars) + "\n...[truncated]" };
					}
					if (block.type === "toolCall" && block.arguments) {
						const argsStr = JSON.stringify(block.arguments);
						if (argsStr.length > config.toolCallTruncateChars) {
							return { ...block, arguments: { _truncated: argsStr.slice(0, config.toolCallTruncateChars) + "...[truncated]" } };
						}
					}
					return block;
				}),
			};
		}
		case "toolResult": {
			const content = (msg as { content: unknown }).content;
			if (typeof content === "string" && content.length > config.toolResultTruncateChars) {
				return { ...msg, content: [{ type: "text" as const, text: content.slice(0, config.toolResultTruncateChars) + "\n...[truncated]" }] };
			}
			if (Array.isArray(content)) {
				return {
					...msg,
					content: content.map((block: any) => {
						if (block.type === "text" && block.text && block.text.length > config.toolResultTruncateChars) {
							return { ...block, text: block.text.slice(0, config.toolResultTruncateChars) + "\n...[truncated]" };
						}
						return block;
					}),
				};
			}
			return msg;
		}
		default:
			return msg;
	}
}

/**
 * 增强版序列化：先截断再调用 pi 内置 serializeConversation
 *
 * pi 内置的 serializeConversation 会截断 tool result 到 2000 字符，
 * 但不截断 thinking 和 tool call arguments。
 * 这里先用 preprocessMessage 截断这些大内容，再交给 pi 序列化。
 */
export function serializeConversationEnhanced(
	messages: AgentMessage[],
	config: SmartCompactConfig,
): string {
	const preprocessed = messages.map((m) => preprocessMessage(m, config));
	// convertToLlm 把 AgentMessage 转为 LLM Message 格式
	const llmMessages = convertToLlm(preprocessed);
	// pi 内置 serializeConversation 有自己的截断逻辑（tool result 2000 字符）
	return serializeConversation(llmMessages);
}
