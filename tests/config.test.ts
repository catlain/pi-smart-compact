import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../types.js";

// Mock @pi-atelier/shared-utils
const mockGetSettingsSection = vi.hoisted(() => vi.fn());
const mockPatchSettingsSection = vi.hoisted(() => vi.fn());

vi.mock("@pi-atelier/shared-utils", () => ({
	getSettingsSection: mockGetSettingsSection,
	patchSettingsSection: mockPatchSettingsSection,
}));

// Mock node:fs（用于 migrateLegacyConfig 测试）
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockUnlinkSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
	existsSync: mockExistsSync,
	readFileSync: mockReadFileSync,
	unlinkSync: mockUnlinkSync,
}));

// 重新导入（在 mock 之后）
const mod = await import("../config.js");
const { getSmartCompactConfig, setSmartCompactConfig, migrateLegacyConfig } = mod;

describe("config", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("DEFAULT_CONFIG 有正确的默认值", () => {
		expect(DEFAULT_CONFIG.enabled).toBe(false);
		expect(DEFAULT_CONFIG.filterBatchSize).toBe(20);
		expect(DEFAULT_CONFIG.thinkingTruncateChars).toBe(500);
		expect(DEFAULT_CONFIG.toolCallTruncateChars).toBe(1000);
		expect(DEFAULT_CONFIG.toolResultTruncateChars).toBe(2000);
	});

	describe("getSmartCompactConfig", () => {
		it("调用 getSettingsSection 读取 smartCompact section", () => {
			const merged = { ...DEFAULT_CONFIG, enabled: true, filterBatchSize: 10 };
			mockGetSettingsSection.mockReturnValue(merged);

			const config = getSmartCompactConfig();
			expect(config).toEqual(merged);
			expect(mockGetSettingsSection).toHaveBeenCalledWith(
				"smartCompact",
				DEFAULT_CONFIG,
			);
		});

		it("无自定义配置时返回默认值", () => {
			mockGetSettingsSection.mockReturnValue({ ...DEFAULT_CONFIG });

			const config = getSmartCompactConfig();
			expect(config).toEqual(DEFAULT_CONFIG);
		});
	});

	describe("setSmartCompactConfig", () => {
		it("增量更新配置并返回合并结果", () => {
			const merged = { ...DEFAULT_CONFIG, enabled: true };
			mockPatchSettingsSection.mockReturnValue(merged);

			const result = setSmartCompactConfig({ enabled: true });
			expect(result).toEqual(merged);
			expect(mockPatchSettingsSection).toHaveBeenCalledWith(
				"smartCompact",
				{ enabled: true },
				DEFAULT_CONFIG,
			);
		});

		it("更新部分字段时只传 patch", () => {
			const merged = { ...DEFAULT_CONFIG, filterBatchSize: 50 };
			mockPatchSettingsSection.mockReturnValue(merged);

			setSmartCompactConfig({ filterBatchSize: 50 });
			expect(mockPatchSettingsSection).toHaveBeenCalledWith(
				"smartCompact",
				{ filterBatchSize: 50 },
				DEFAULT_CONFIG,
			);
		});
	});

	describe("migrateLegacyConfig", () => {
		it("settings.json 已有 smartCompact section → 跳过迁移", () => {
			mockReadFileSync.mockReturnValue(
				JSON.stringify({ smartCompact: { enabled: true } }),
			);

			migrateLegacyConfig();

			expect(mockExistsSync).not.toHaveBeenCalled();
			expect(mockPatchSettingsSection).not.toHaveBeenCalled();
			expect(mockUnlinkSync).not.toHaveBeenCalled();
		});

		it("settings.json 无 section + 旧文件存在 → 迁移并删除旧文件", () => {
			// settings.json 无 smartCompact section
			mockReadFileSync.mockReturnValueOnce(JSON.stringify({ context: {} }));
			// 旧文件存在
			mockExistsSync.mockReturnValueOnce(true);
			// 旧文件内容
			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify({ enabled: true, filterBatchSize: 15 }),
			);

			migrateLegacyConfig();

			expect(mockPatchSettingsSection).toHaveBeenCalledWith(
				"smartCompact",
				{ enabled: true, filterBatchSize: 15 },
				DEFAULT_CONFIG,
			);
			expect(mockUnlinkSync).toHaveBeenCalledWith(
				join(".pi", "smart-compact.json"),
			);
		});

		it("旧文件不存在 → 跳过", () => {
			mockReadFileSync.mockReturnValueOnce(JSON.stringify({ context: {} }));
			mockExistsSync.mockReturnValueOnce(false);

			migrateLegacyConfig();

			expect(mockPatchSettingsSection).not.toHaveBeenCalled();
			expect(mockUnlinkSync).not.toHaveBeenCalled();
		});

		it("settings.json 不存在 → 继续尝试迁移旧文件", () => {
			// settings.json 读取失败
			mockReadFileSync.mockImplementationOnce(() => {
				throw new Error("ENOENT");
			});
			mockExistsSync.mockReturnValueOnce(true);
			mockReadFileSync.mockReturnValueOnce(JSON.stringify({ enabled: true }));

			migrateLegacyConfig();

			expect(mockPatchSettingsSection).toHaveBeenCalledOnce();
		});

		it("旧文件 JSON 损坏 → 静默失败不抛异常", () => {
			mockReadFileSync.mockReturnValueOnce(JSON.stringify({ context: {} }));
			mockExistsSync.mockReturnValueOnce(true);
			mockReadFileSync.mockReturnValueOnce("not valid json");

			expect(() => migrateLegacyConfig()).not.toThrow();
		});

		it("只迁移 DEFAULT_CONFIG 中定义的有效字段", () => {
			mockReadFileSync.mockReturnValueOnce(JSON.stringify({}));
			mockExistsSync.mockReturnValueOnce(true);
			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify({
					enabled: true,
					unknownField: "should be ignored",
					filterBatchSize: 30,
				}),
			);

			migrateLegacyConfig();

			const patchArg = mockPatchSettingsSection.mock.calls[0][1];
			expect(patchArg).toEqual({ enabled: true, filterBatchSize: 30 });
			expect(patchArg).not.toHaveProperty("unknownField");
		});
	});
});
