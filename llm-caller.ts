/**
 * LLM 调用封装 + 任务提取。
 *
 * 从 ExtensionContext 构建统一的 LLM 调用接口，
 * 以及从尾部消息提取当前任务描述。
 */
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { completeSimple } from '@earendil-works/pi-ai';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { serializeConversationEnhanced } from './serializer.js';
import { EXTRACT_TASK_PROMPT, SEGMENT_SYSTEM_PROMPT } from './prompts.js';
import type { SmartCompactConfig } from './types.js';

/** 统一的 LLM 调用签名 */
export type LLMCaller = (system: string, user: string, signal?: AbortSignal) => Promise<string>;

/**
 * 从 ExtensionContext 创建 LLM 调用函数。
 * 支持指定模型 ID（用于 Phase 1 用便宜模型）。
 * modelId 格式: "provider/model-name"
 */
export function createLLMCaller(ctx: ExtensionContext, modelId?: string): LLMCaller {
	return async (system: string, user: string, signal?: AbortSignal): Promise<string> => {
		let model = ctx.model;
		if (modelId) {
			const sepIdx = modelId.indexOf('/');
			if (sepIdx > 0) {
				const provider = modelId.slice(0, sepIdx);
				const id = modelId.slice(sepIdx + 1);
				model = ctx.modelRegistry.find(provider, id) ?? ctx.model;
			}
		}
		if (!model) {
			throw new Error(`[smart-compact] 模型不可用: ${modelId ?? 'session model'}`);
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			throw new Error(`[smart-compact] API key 不可用: ${auth.error}`);
		}

		const result = await completeSimple(
			model,
			{
				systemPrompt: system,
				messages: [
					{
						role: 'user' as const,
						content: [{ type: 'text' as const, text: user }],
						timestamp: Date.now(),
					},
				],
			},
			{ maxTokens: 4096, apiKey: auth.apiKey, headers: auth.headers, signal },
		);

		if (result.stopReason === 'error') {
			throw new Error(`[smart-compact] LLM 调用失败: ${result.errorMessage ?? 'unknown'}`);
		}

		return result.content
			.filter((c: any) => c.type === 'text')
			.map((c: any) => c.text)
			.join('\n');
	};
}

/**
 * 从尾部消息提取当前任务描述。
 * 取最近 10 条消息序列化后交给 LLM 提取。
 */
export async function extractCurrentTask(
	tailMessages: AgentMessage[],
	callLLM: LLMCaller,
	config: SmartCompactConfig,
	signal?: AbortSignal,
): Promise<string> {
	const tailText = serializeConversationEnhanced(tailMessages.slice(-10), config);

	if (tailText.length < 100) {
		return '(无法提取当前任务)';
	}

	try {
		const prompt = `${EXTRACT_TASK_PROMPT}\n\n<recent-messages>\n${tailText}\n</recent-messages>`;
		return await callLLM(SEGMENT_SYSTEM_PROMPT, prompt, signal);
	} catch {
		return '(任务提取失败)';
	}
}
