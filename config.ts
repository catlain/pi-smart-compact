/**
 * Smart-Compact v2 配置管理
 */

import type { SmartCompactConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export { DEFAULT_CONFIG } from "./types.js";
export type { SmartCompactConfig } from "./types.js";

const CONFIG_DIR = ".pi";
const CONFIG_FILE = "smart-compact.json";

/** 读取配置（文件不存在则返回默认值） */
export async function loadConfig(): Promise<SmartCompactConfig> {
	try {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		const filePath = path.join(CONFIG_DIR, CONFIG_FILE);
		const raw = await fs.readFile(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

/** 保存配置到文件 */
export async function saveConfig(config: SmartCompactConfig): Promise<void> {
	const fs = await import("node:fs/promises");
	const path = await import("node:path");
	await fs.mkdir(CONFIG_DIR, { recursive: true });
	const filePath = path.join(CONFIG_DIR, CONFIG_FILE);
	await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
}
