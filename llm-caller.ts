/**
 * LLM 调用封装。
 *
 * 从 ExtensionContext 构建统一的 LLM 调用接口。
 */
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { completeSimple } from '@earendil-works/pi-ai';
import type { ContentBlock, LLMCaller } from './types.js';

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
			.filter((c: ContentBlock): c is ContentBlock & { type: "text" } => c.type === 'text')
			.map((c: ContentBlock & { type: "text" }) => c.text)
			.join('\n');
	};
}


