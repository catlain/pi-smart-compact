/**
 * Smart-Compact v2 配置管理
 *
 * 接入统一配置架构：持久化到 ~/.pi/agent/settings.json 的 smartCompact section。
 * 与 pi-context-manager 的 context section 做法一致。
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	getSettingsSection,
	patchSettingsSection,
} from "@pi-atelier/shared-utils";
import type { SmartCompactConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export { DEFAULT_CONFIG } from "./types.js";
export type { SmartCompactConfig } from "./types.js";

const SECTION = "smartCompact";
const SETTINGS_PATH = join(homedir(), ".pi/agent/settings.json");
const LEGACY_CONFIG_PATH = join(".pi", "smart-compact.json");

/** 读取配置（同步，从 settings.json 的 smartCompact section 合并默认值） */
export function getSmartCompactConfig(): SmartCompactConfig {
	return getSettingsSection<SmartCompactConfig>(SECTION, DEFAULT_CONFIG);
}

/** 增量更新配置到 settings.json */
export function setSmartCompactConfig(
	patch: Partial<SmartCompactConfig>,
): SmartCompactConfig {
	return patchSettingsSection<SmartCompactConfig>(SECTION, patch, DEFAULT_CONFIG);
}

/**
 * 一次性迁移：旧 .pi/smart-compact.json → settings.json smartCompact section。
 *
 * 设计说明：
 * - 幂等判断用「settings.json 里 smartCompact section 是否存在」，不复用 getSettingsSection，
 *   因为后者返回合并默认值后的对象，无法区分「从未配置」与「配置了空对象」。
 * - 由扩展入口 index.ts 调用一次，不在模块加载时自动执行（便于测试隔离）。
 * - 静默失败：任何异常都不阻断扩展启动。
 */
export function migrateLegacyConfig(): void {
	// settings.json 已有 smartCompact section → 已迁移/已配置，跳过
	try {
		const raw = readFileSync(SETTINGS_PATH, "utf-8");
		const settings = JSON.parse(raw);
		if (settings[SECTION] !== undefined) return;
	} catch {
		// settings.json 不存在或损坏，继续尝试迁移（patchSettingsSection 会创建）
	}

	// 旧文件存在则迁移
	try {
		if (!existsSync(LEGACY_CONFIG_PATH)) return;
		const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, "utf-8"));
		const patch: Record<string, unknown> = {};
		for (const key of Object.keys(DEFAULT_CONFIG)) {
			if (key in legacy) patch[key] = legacy[key];
		}
		patchSettingsSection(SECTION, patch, DEFAULT_CONFIG);
		unlinkSync(LEGACY_CONFIG_PATH);
		console.log(
			"[smart-compact] 已迁移旧配置 .pi/smart-compact.json → settings.json",
		);
	} catch (err) {
		console.warn("[smart-compact] 迁移旧配置失败（忽略）:", err);
	}
}
