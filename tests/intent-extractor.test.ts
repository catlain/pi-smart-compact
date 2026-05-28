import { describe, it, expect, vi } from 'vitest';
import { extractNonToolText, summarizeIntent } from '../intent-extractor.js';
import { DEFAULT_CONFIG } from '../config.js';
import type { AgentMessage } from '@earendil-works/pi-agent-core';

describe('intent-extractor', () => {
	describe('extractNonToolText', () => {
		it('提取 user 消息文本', () => {
			const messages = [
				{ role: 'user', content: '帮我修复 bug' },
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toContain('帮我修复 bug');
			expect(result).toContain('[用户]');
		});

		it('提取 assistant 非 toolCall 文本', () => {
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'text', text: '好的，我来修复' },
						{ type: 'toolCall', toolCallId: 'tc_1', name: 'read', arguments: '{}' },
					],
				},
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toContain('好的，我来修复');
			expect(result).toContain('[AI]');
			expect(result).not.toContain('tc_1');
		});

		it('跳过 toolResult 消息', () => {
			const messages = [
				{ role: 'user', content: '第一步' },
				{
					role: 'toolResult',
					toolCallId: 'tc_1',
					content: '一些工具输出',
				},
				{ role: 'user', content: '第二步' },
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toContain('第一步');
			expect(result).toContain('第二步');
			expect(result).not.toContain('一些工具输出');
		});

		it('多轮对话格式正确', () => {
			const messages = [
				{ role: 'user', content: '第一步' },
				{ role: 'assistant', content: [{ type: 'text', text: '好的' }] },
				{ role: 'user', content: '第二步' },
				{ role: 'assistant', content: [{ type: 'text', text: '完成' }] },
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toContain('[用户]');
			expect(result).toContain('[AI]');
			expect(result).toContain('第一步');
			expect(result).toContain('完成');
		});

		it('空消息列表返回空字符串', () => {
			const result = extractNonToolText([], DEFAULT_CONFIG);
			expect(result).toBe('');
		});

		it('assistant content 为字符串时提取文本', () => {
			const messages = [
				{ role: 'assistant', content: '纯字符串回复' },
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toContain('纯字符串回复');
		});

		it('assistant content 包含 thinking 块时跳过 thinking', () => {
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'thinking', thinking: '内部思考...' },
						{ type: 'text', text: '公开回复' },
					],
				},
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toContain('公开回复');
			expect(result).not.toContain('内部思考');
		});

		it('user content 为数组时提取文本', () => {
			const messages = [
				{ role: 'user', content: [{ type: 'text', text: 'help' }, { type: 'image', url: 'img.png' }] },
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toContain('help');
		});

		it('user content 为空或无效时返回空字符串', () => {
			const messages = [
				{ role: 'user', content: null },
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toBe('');
		});

		it('assistant 仅有 toolCall 无文本', () => {
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'toolCall', toolCallId: 'tc_1', name: 'read', arguments: '{}' },
					],
				},
			] as any as AgentMessage[];
			const result = extractNonToolText(messages, DEFAULT_CONFIG);
			expect(result).toBe('');
		});
	});

	describe('summarizeIntent', () => {
		it('调用 LLM 生成意图总结', async () => {
			const mockCall = vi.fn().mockResolvedValue('用户期望修复登录功能');
			const result = await summarizeIntent('帮我修复登录问题', undefined, mockCall);
			expect(result).toBe('用户期望修复登录功能');
			expect(mockCall).toHaveBeenCalledOnce();
		});

		it('包含 previousSummary', async () => {
			const mockCall = vi.fn().mockResolvedValue('继续修复');
			const result = await summarizeIntent('新消息', '之前正在修复登录', mockCall);
			expect(result).toBe('继续修复');
			const userPrompt = mockCall.mock.calls[0][1];
			expect(userPrompt).toContain('之前正在修复登录');
		});

		it('无 previousSummary 时传默认值', async () => {
			const mockCall = vi.fn().mockResolvedValue('总结');
			await summarizeIntent('test', undefined, mockCall);
			const userPrompt = mockCall.mock.calls[0][1];
			expect(userPrompt).toContain('(无)');
		});

		it('传入 abort signal', async () => {
			const mockCall = vi.fn().mockResolvedValue('result');
			const controller = new AbortController();
			await summarizeIntent('test', undefined, mockCall, controller.signal);
			expect(mockCall.mock.calls[0][2]).toBe(controller.signal);
		});

		it('trim 掉多余空白', async () => {
			const mockCall = vi.fn().mockResolvedValue('  带空白的返回  ');
			const result = await summarizeIntent('test', undefined, mockCall);
			expect(result).toBe('带空白的返回');
		});
	});
});
