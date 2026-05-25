import { describe, it, expect } from 'vitest';
import { extractNonToolText } from '../intent-extractor.js';
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
	});
});
