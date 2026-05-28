/**
 * Phase 2: 工具去留过滤器
 *
 * 收集消息中所有 toolCall+toolResult 对，基于意图判断哪些需要保留。
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SmartCompactConfig, ToolPair, ToolVerdict, LLMCaller, ContentBlock } from "./types.js";
import { PREVIEW_LENGTH } from "./types.js";
import { FILTER_SYSTEM_PROMPT, FILTER_USER_PROMPT } from "./prompts.js";

/**
 * 从消息列表中收集所有 toolCall+toolResult 对
 */
export function collectToolPairs(
	messages: AgentMessage[],
	config: SmartCompactConfig,
): ToolPair[] {
	const pairs: ToolPair[] = [];
	const toolCallMap = new Map<string, { name: string; args: string; index: number }>();

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];

		// 收集 assistant 消息中的 toolCall
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content as ContentBlock[]) {
				if (block.type === "toolCall" && "toolCallId" in block) {
					const tb = block as { type: "toolCall"; toolCallId: string; name?: string; arguments?: unknown };
					const argsStr = typeof tb.arguments === "string"
						? tb.arguments
						: JSON.stringify(tb.arguments ?? {});
					const truncated = argsStr.length > config.toolCallTruncateChars
						? argsStr.slice(0, config.toolCallTruncateChars) + "...[truncated]"
						: argsStr;

					toolCallMap.set(tb.toolCallId, {
						name: tb.name ?? "unknown",
						args: truncated,
						index: i,
					});
				}
			}
		}

		// 收集 toolResult
		if (msg.role === "toolResult") {
			const toolCallId = (msg as { toolCallId?: string }).toolCallId;
			if (!toolCallId) continue;

			const call = toolCallMap.get(toolCallId);
			if (!call) continue;

			const resultText = extractToolResultText(msg, config);
			pairs.push({
				toolCallId,
				toolName: call.name,
				argsSummary: call.args,
				resultText,
				messageIndex: call.index,
			});
		}
	}

	return pairs;
}

/**
 * 提取 toolResult 的文本内容
 */
function extractToolResultText(msg: AgentMessage, config: SmartCompactConfig): string {
	const content = (msg as { content?: unknown }).content;
	let text = "";

	if (typeof content === "string") {
		text = content;
	} else if (Array.isArray(content)) {
		const texts: string[] = [];
		for (const block of content as ContentBlock[]) {
			if (block.type === "text" && "text" in block) {
				texts.push((block as { type: "text"; text: string }).text);
			}
		}
		text = texts.join("\n");
	}

	// 截断过长的结果
	if (text.length > config.toolResultTruncateChars) {
		text = text.slice(0, config.toolResultTruncateChars) + "...[truncated]";
	}

	return text;
}

/**
 * 格式化工具列表用于 prompt
 */
export function formatToolList(pairs: ToolPair[]): string {
	return pairs.map((p, i) =>
		`[${i}] id=${p.toolCallId} tool=${p.toolName}\n  args: ${p.argsSummary}\n  result (preview): ${previewResult(p.resultText)}`
	).join("\n\n");
}

function previewResult(text: string): string {
	if (text.length <= PREVIEW_LENGTH) return text;
	return text.slice(0, PREVIEW_LENGTH) + "...";
}

/**
 * 解析 LLM 返回的 JSON verdict 数组
 */
export function parseVerdicts(raw: string): ToolVerdict[] {
	// 尝试提取 JSON（支持 markdown code block 和裸 JSON）
	let jsonStr = raw.trim();

	// 去掉 markdown code fence
	const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch) {
		jsonStr = fenceMatch[1].trim();
	}

	try {
		const parsed = JSON.parse(jsonStr);
		if (!Array.isArray(parsed)) return [];
		return parsed.map((v: Record<string, unknown>) => ({
			toolCallId: String(v["toolCallId"] ?? ""),
			keep: v["keep"] !== false,
			reason: String(v["reason"] ?? ""),
		}));
	} catch {
		// 解析失败 → 全部保留（保守策略）
		return [];
	}
}

/**
 * 批量判断工具去留
 */
export async function filterTools(
	pairs: ToolPair[],
	intent: string,
	config: SmartCompactConfig,
	callLLM: LLMCaller,
	signal?: AbortSignal,
): Promise<ToolVerdict[]> {
	if (pairs.length === 0) return [];

	const allVerdicts: ToolVerdict[] = [];
	const batchSize = config.filterBatchSize;

	for (let i = 0; i < pairs.length; i += batchSize) {
		const batch = pairs.slice(i, i + batchSize);
		const toolList = formatToolList(batch);
		const idMap = new Map(batch.map((p, idx) => [String(idx), p.toolCallId]));

		const userPrompt = FILTER_USER_PROMPT
			.replace("{intent}", intent)
			.replace("{toolList}", toolList);

		const raw = await callLLM(FILTER_SYSTEM_PROMPT, userPrompt, signal);
		const verdicts = parseVerdicts(raw);

		// 将本地索引映射回原始 toolCallId
		for (const v of verdicts) {
			// LLM 可能用原始 toolCallId 或本地索引
			const resolvedId = idMap.get(v.toolCallId) ?? v.toolCallId;
			allVerdicts.push({
				...v,
				toolCallId: resolvedId,
			});
		}

		// 没有返回 verdict 的工具 → 保守保留
		for (const p of batch) {
			if (!allVerdicts.some((v) => v.toolCallId === p.toolCallId)) {
				allVerdicts.push({
					toolCallId: p.toolCallId,
					keep: true,
					reason: "LLM 未返回判断，保守保留",
				});
			}
		}
	}

	return allVerdicts;
}
