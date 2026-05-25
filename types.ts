/**
 * Smart-Compact v2 类型定义
 *
 * 两阶段压缩：意图总结 → 工具去留判断
 */

/** 扩展配置 */
export interface SmartCompactConfig {
	/** 是否自动接管 pi 的 compaction（默认 false，手动 /smart-compact 触发） */
	enabled: boolean;

	/** 意图总结使用的模型（空则用 session 默认模型） */
	intentModel?: string;

	/** 工具去留判断使用的模型（空则用 session 默认模型） */
	filterModel?: string;

	/** thinking 块截断字符数 */
	thinkingTruncateChars: number;

	/** toolCall arguments 截断字符数 */
	toolCallTruncateChars: number;

	/** toolResult 内容截断字符数 */
	toolResultTruncateChars: number;

	/** 工具去留判断的批大小（每批多少个工具一起判断） */
	filterBatchSize: number;
}

export const DEFAULT_CONFIG: SmartCompactConfig = {
	enabled: false,
	intentModel: undefined,
	filterModel: undefined,
	thinkingTruncateChars: 500,
	toolCallTruncateChars: 1000,
	toolResultTruncateChars: 2000,
	filterBatchSize: 20,
};

/** 一个工具调用+结果对 */
export interface ToolPair {
	/** 工具调用 ID */
	toolCallId: string;
	/** 工具名称 */
	toolName: string;
	/** 工具参数摘要 */
	argsSummary: string;
	/** 工具结果文本 */
	resultText: string;
	/** 在原始消息列表中的位置（用于排序） */
	messageIndex: number;
}

/** 工具去留判断结果 */
export interface ToolVerdict {
	toolCallId: string;
	keep: boolean;
	reason: string;
}

/** LLM caller 函数签名 */
export type LLMCaller = (
	system: string,
	user: string,
	signal?: AbortSignal,
) => Promise<string>;
