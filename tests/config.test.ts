import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../config.js';

describe('config', () => {
	it('DEFAULT_CONFIG 有正确的默认值', () => {
		expect(DEFAULT_CONFIG.enabled).toBe(false);
		expect(DEFAULT_CONFIG.filterBatchSize).toBe(20);
		expect(DEFAULT_CONFIG.thinkingTruncateChars).toBe(500);
		expect(DEFAULT_CONFIG.toolCallTruncateChars).toBe(1000);
		expect(DEFAULT_CONFIG.toolResultTruncateChars).toBe(2000);
	});
});
