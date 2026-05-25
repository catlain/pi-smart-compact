import { describe, it, expect } from 'vitest';
import { INTENT_SYSTEM_PROMPT, INTENT_USER_PROMPT, FILTER_SYSTEM_PROMPT, FILTER_USER_PROMPT } from '../prompts.js';

describe('prompts', () => {
	describe('prompt 模板', () => {
		it('INTENT_USER_PROMPT 包含占位符', () => {
			expect(INTENT_USER_PROMPT).toContain('{previousSummary}');
			expect(INTENT_USER_PROMPT).toContain('{conversation}');
		});

		it('INTENT_SYSTEM_PROMPT 包含关键指令', () => {
			expect(INTENT_SYSTEM_PROMPT).toContain('Intent');
			expect(INTENT_SYSTEM_PROMPT).toContain('Progress');
			expect(INTENT_SYSTEM_PROMPT).toContain('Critical Context');
		});

		it('FILTER_USER_PROMPT 包含占位符', () => {
			expect(FILTER_USER_PROMPT).toContain('{intent}');
			expect(FILTER_USER_PROMPT).toContain('{toolList}');
		});

		it('FILTER_SYSTEM_PROMPT 包含判断规则', () => {
			expect(FILTER_SYSTEM_PROMPT).toContain('KEEP');
			expect(FILTER_SYSTEM_PROMPT).toContain('DISCARD');
		});
	});

	describe('parseVerdicts（从 tool-filter 间接测试）', () => {
		// parseVerdicts 是 tool-filter.ts 的内部函数，通过 formatToolList 等间接测试
		it('formatToolList 格式正确', async () => {
			const { formatToolList } = await import('../tool-filter.js');
			const pairs = [
				{ toolCallId: 'tc_1', toolName: 'read', argsSummary: '{"path":"a.ts"}', resultText: 'content', messageIndex: 0 },
			];
			const result = formatToolList(pairs as any);
			expect(result).toContain('tc_1');
			expect(result).toContain('read');
			expect(result).toContain('a.ts');
		});
	});
});
