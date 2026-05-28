import { describe, it, expect, vi } from 'vitest';
import { collectToolPairs, formatToolList, parseVerdicts, filterTools } from '../tool-filter.js';
import { DEFAULT_CONFIG } from '../config.js';
import type { AgentMessage } from '@earendil-works/pi-agent-core';

describe('tool-filter', () => {
	describe('collectToolPairs', () => {
		it('收集 toolCall+toolResult 对', () => {
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'toolCall', toolCallId: 'tc_1', name: 'read', arguments: '{"path":"a.ts"}' },
					],
				},
				{
					role: 'toolResult',
					toolCallId: 'tc_1',
					content: 'file content here',
				},
			] as any as AgentMessage[];
			const pairs = collectToolPairs(messages, DEFAULT_CONFIG);
			expect(pairs).toHaveLength(1);
			expect(pairs[0].toolCallId).toBe('tc_1');
			expect(pairs[0].toolName).toBe('read');
			expect(pairs[0].resultText).toBe('file content here');
		});

		it('忽略无 toolCallId 的 toolResult', () => {
			const messages = [
				{
					role: 'toolResult',
					content: 'orphan result',
				},
			] as any as AgentMessage[];
			const pairs = collectToolPairs(messages, DEFAULT_CONFIG);
			expect(pairs).toHaveLength(0);
		});

		it('截断过长的 toolResult', () => {
			const longResult = 'x'.repeat(3000);
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'toolCall', toolCallId: 'tc_1', name: 'read', arguments: '{}' },
					],
				},
				{
					role: 'toolResult',
					toolCallId: 'tc_1',
					content: longResult,
				},
			] as any as AgentMessage[];
			const pairs = collectToolPairs(messages, DEFAULT_CONFIG);
			expect(pairs[0].resultText.length).toBeLessThan(3000);
			expect(pairs[0].resultText).toContain('[truncated]');
		});

		it('截断过长的 toolCall arguments', () => {
			const longArgs = 'a'.repeat(2000);
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'toolCall', toolCallId: 'tc_1', name: 'bash', arguments: longArgs },
					],
				},
				{
					role: 'toolResult',
					toolCallId: 'tc_1',
					content: 'ok',
				},
			] as any as AgentMessage[];
			const pairs = collectToolPairs(messages, DEFAULT_CONFIG);
			expect(pairs[0].argsSummary.length).toBeLessThan(2000);
			expect(pairs[0].argsSummary).toContain('[truncated]');
		});

		it('多个工具对正确配对', () => {
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'toolCall', toolCallId: 'tc_1', name: 'read', arguments: '{"path":"a.ts"}' },
						{ type: 'toolCall', toolCallId: 'tc_2', name: 'grep', arguments: '{"pattern":"fn"}' },
					],
				},
				{
					role: 'toolResult',
					toolCallId: 'tc_1',
					content: 'content a',
				},
				{
					role: 'toolResult',
					toolCallId: 'tc_2',
					content: 'match: fn()',
				},
			] as any as AgentMessage[];
			const pairs = collectToolPairs(messages, DEFAULT_CONFIG);
			expect(pairs).toHaveLength(2);
			expect(pairs[0].toolName).toBe('read');
			expect(pairs[1].toolName).toBe('grep');
		});

		it('空消息列表返回空数组', () => {
			const pairs = collectToolPairs([], DEFAULT_CONFIG);
			expect(pairs).toHaveLength(0);
		});
	});

	describe('formatToolList', () => {
		it('格式化包含工具信息', () => {
			const pairs = [
				{ toolCallId: 'tc_1', toolName: 'read', argsSummary: '{"path":"a.ts"}', resultText: 'content', messageIndex: 0 },
			];
			const result = formatToolList(pairs as any);
			expect(result).toContain('tc_1');
			expect(result).toContain('read');
			expect(result).toContain('a.ts');
		});
	});

	describe('filterTools', () => {
		it('空列表返回空数组', async () => {
			const mockCall = vi.fn();
			const result = await filterTools([], 'test intent', DEFAULT_CONFIG, mockCall);
			expect(result).toEqual([]);
			expect(mockCall).not.toHaveBeenCalled();
		});

		it('调用 LLM 并解析结果', async () => {
			const mockCall = vi.fn().mockResolvedValue(
				'[{"toolCallId":"tc_1","keep":true,"reason":"still needed"}]',
			);
			const pairs = [
				{ toolCallId: 'tc_1', toolName: 'read', argsSummary: '{"path":"a.ts"}', resultText: 'content', messageIndex: 0 },
			];
			const result = await filterTools(pairs as any, 'test intent', DEFAULT_CONFIG, mockCall);
			expect(result).toHaveLength(1);
			expect(result[0].toolCallId).toBe('tc_1');
			expect(result[0].keep).toBe(true);
		});

		it('LLM 返回空数组时保守保留所有工具', async () => {
			const mockCall = vi.fn().mockResolvedValue('[]');
			const pairs = [
				{ toolCallId: 'tc_1', toolName: 'read', argsSummary: '{}', resultText: 'content', messageIndex: 0 },
				{ toolCallId: 'tc_2', toolName: 'grep', argsSummary: '{}', resultText: 'matches', messageIndex: 1 },
			];
			const result = await filterTools(pairs as any, 'test', DEFAULT_CONFIG, mockCall);
			expect(result).toHaveLength(2);
			expect(result.every((v) => v.keep)).toBe(true);
			expect(result[0].reason).toContain('保守保留');
		});

		it('分批调用 LLM（超过 batchSize）', async () => {
			const mockCall = vi.fn().mockResolvedValue('[]');
			const config = { ...DEFAULT_CONFIG, filterBatchSize: 2 };
			const pairs = Array.from({ length: 5 }, (_, i) => ({
				toolCallId: `tc_${i}`, toolName: 'read', argsSummary: '{}', resultText: 'content', messageIndex: i,
			}));
			const result = await filterTools(pairs as any, 'test', config, mockCall);
			expect(mockCall).toHaveBeenCalledTimes(3); // 3 批：2+2+1
			expect(result).toHaveLength(5);
		});

		it('LLM 返回拒绝 verdict', async () => {
			const mockCall = vi.fn().mockResolvedValue(
				'[{"toolCallId":"tc_1","keep":false,"reason":"completed step"}]',
			);
			const pairs = [
				{ toolCallId: 'tc_1', toolName: 'edit', argsSummary: '{}', resultText: 'written', messageIndex: 0 },
			];
			const result = await filterTools(pairs as any, 'test', DEFAULT_CONFIG, mockCall);
			expect(result).toHaveLength(1);
			expect(result[0].keep).toBe(false);
			expect(result[0].reason).toBe('completed step');
		});

		it('传入 abort signal', async () => {
			const mockCall = vi.fn().mockResolvedValue('[]');
			const controller = new AbortController();
			const pairs = [
				{ toolCallId: 'tc_1', toolName: 'read', argsSummary: '{}', resultText: 'content', messageIndex: 0 },
			];
			await filterTools(pairs as any, 'test', DEFAULT_CONFIG, mockCall, controller.signal);
			expect(mockCall.mock.calls[0][2]).toBe(controller.signal);
		});

		it('LLM 用本地索引映射回原始 toolCallId', async () => {
			// LLM 可能用本地索引 [0], [1] 而不是原始 toolCallId
			const mockCall = vi.fn().mockResolvedValue(
				'[{"toolCallId":"0","keep":true,"reason":"needed"}]',
			);
			const pairs = [
				{ toolCallId: 'tc_real_1', toolName: 'read', argsSummary: '{}', resultText: 'content', messageIndex: 0 },
			];
			const result = await filterTools(pairs as any, 'test', DEFAULT_CONFIG, mockCall);
			expect(result[0].toolCallId).toBe('tc_real_1');
		});
	});

	describe('parseVerdicts', () => {
		it('解析有效 JSON 数组', () => {
			const raw = '[{"toolCallId":"tc_1","keep":true,"reason":"still needed"},{"toolCallId":"tc_2","keep":false,"reason":"completed"}]';
			const verdicts = parseVerdicts(raw);
			expect(verdicts).toHaveLength(2);
			expect(verdicts[0].toolCallId).toBe('tc_1');
			expect(verdicts[0].keep).toBe(true);
			expect(verdicts[1].keep).toBe(false);
		});

		it('解析 markdown code block 中的 JSON', () => {
			const raw = '```json\n[{"toolCallId":"tc_1","keep":true,"reason":"ok"}]\n```';
			const verdicts = parseVerdicts(raw);
			expect(verdicts).toHaveLength(1);
			expect(verdicts[0].keep).toBe(true);
		});

		it('解析失败返回空数组（保守策略）', () => {
			const verdicts = parseVerdicts('not valid json at all');
			expect(verdicts).toEqual([]);
		});

		it('非数组 JSON 返回空数组', () => {
			const verdicts = parseVerdicts('{"not":"array"}');
			expect(verdicts).toEqual([]);
		});
	});
});
