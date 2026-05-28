import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_CONFIG } from '../config.js';

// Mock node:fs/promises 用于测试 loadConfig 和 saveConfig
const mockReadFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
	readFile: mockReadFile,
	writeFile: mockWriteFile,
	mkdir: mockMkdir,
}));

// 重新导入 loadConfig/saveConfig（在 mock 之后）
const mod = await import('../config.js');
const { loadConfig, saveConfig } = mod;

describe('config', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('DEFAULT_CONFIG 有正确的默认值', () => {
		expect(DEFAULT_CONFIG.enabled).toBe(false);
		expect(DEFAULT_CONFIG.filterBatchSize).toBe(20);
		expect(DEFAULT_CONFIG.thinkingTruncateChars).toBe(500);
		expect(DEFAULT_CONFIG.toolCallTruncateChars).toBe(1000);
		expect(DEFAULT_CONFIG.toolResultTruncateChars).toBe(2000);
	});

	describe('loadConfig', () => {
		it('文件读取成功时合并配置', async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ enabled: true, filterBatchSize: 10 }));

			const config = await loadConfig();
			expect(config.enabled).toBe(true);
			expect(config.filterBatchSize).toBe(10); // 来自文件
			expect(config.thinkingTruncateChars).toBe(500); // 默认值
			expect(mockReadFile).toHaveBeenCalledOnce();
		});

		it('文件不存在时返回默认配置', async () => {
			mockReadFile.mockRejectedValue(new Error('ENOENT'));

			const config = await loadConfig();
			expect(config).toEqual(DEFAULT_CONFIG);
		});

		it('JSON 解析失败时返回默认配置', async () => {
			mockReadFile.mockResolvedValue('not valid json');

			const config = await loadConfig();
			expect(config).toEqual(DEFAULT_CONFIG);
		});

		it('文件包含部分字段时合并到默认值', async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ enabled: true }));

			const config = await loadConfig();
			expect(config.enabled).toBe(true);
			expect(config.thinkingTruncateChars).toBe(500);
			expect(config.toolResultTruncateChars).toBe(2000);
			expect(config.filterBatchSize).toBe(20);
		});
	});

	describe('saveConfig', () => {
		it('写入配置到文件', async () => {
			mockMkdir.mockResolvedValue(undefined);
			mockWriteFile.mockResolvedValue(undefined);

			const customConfig = { ...DEFAULT_CONFIG, enabled: true };
			await saveConfig(customConfig);

			expect(mockMkdir).toHaveBeenCalledOnce();
			expect(mockWriteFile).toHaveBeenCalledOnce();
			const writeArg = mockWriteFile.mock.calls[0][1];
			expect(JSON.parse(writeArg)).toEqual(customConfig);
		});
	});
});
