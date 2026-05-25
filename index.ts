/**
 * smart-compact v2 — 两阶段增强压缩
 *
 * Phase 1: 提取用户+AI 非工具文本 → LLM 生成意图总结
 * Phase 2: 基于意图判断每个工具调用去留 → 删掉不需要的
 * 压缩结果 = 意图总结 + 保留的工具结果原文
 */
import type { CompactionResult, SessionBeforeCompactEvent, ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { extractNonToolText, summarizeIntent } from "./intent-extractor.js";
import { collectToolPairs, filterTools } from "./tool-filter.js";
import { loadConfig, saveConfig } from "./config.js";
import { createLLMCaller } from "./llm-caller.js";

export default async function (pi: ExtensionAPI) {
	let forceRun = false;

	// ─── /smart-compact 命令 ───
	pi.registerCommand("smart-compact", {
		description: "两阶段增强压缩：意图总结 + 工具去留",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			forceRun = true;
			console.log("[smart-compact] 触发增强压缩...");
			try {
				ctx.compact();
			} catch {
				forceRun = false;
				console.error("[smart-compact] ctx.compact() 不可用，请使用 pi 内置 /compact");
			}
		},
	});

	// ─── /smart-compact-config 命令 ───
	pi.registerCommand("smart-compact-config", {
		description: "查看/修改 smart-compact 配置（auto|manual）",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const arg = args.trim().toLowerCase();
			if (arg === "auto" || arg === "on" || arg === "true" || arg === "enable") {
				const config = await loadConfig();
				await saveConfig({ ...config, enabled: true });
				ctx.ui.notify("smart-compact 自动接管已开启", "info");
			} else if (arg === "manual" || arg === "off" || arg === "false" || arg === "disable") {
				const config = await loadConfig();
				await saveConfig({ ...config, enabled: false });
				ctx.ui.notify("smart-compact 自动接管已关闭（仅手动 /smart-compact 触发）", "info");
			} else {
				const config = await loadConfig();
				const status = config.enabled ? "✅ 自动接管已开启" : "❌ 自动接管已关闭（仅手动 /smart-compact 触发）";
				ctx.ui.notify(`${status}\n\n用法:\n  /smart-compact-config auto   — 开启自动\n  /smart-compact-config manual  — 关闭自动`, "info");
			}
		},
	});

	// ─── 核心事件处理器 ───
	pi.on("session_before_compact", async (event: SessionBeforeCompactEvent, ctx: ExtensionCommandContext) => {
		const config = await loadConfig();

		if (!config.enabled && !forceRun) {
			console.log("[smart-compact] 已禁用，使用 pi 内置 compaction");
			return {};
		}
		forceRun = false;

		const { preparation, signal } = event;
		const messagesToSummarize: any[] = (preparation as any).messagesToSummarize ?? [];
		const previousSummary: string | undefined = (preparation as any).previousSummary;
		const firstKeptEntryId: string = (preparation as any).firstKeptEntryId;
		const tokensBefore: number = (preparation as any).tokensBefore ?? 0;

		if (messagesToSummarize.length === 0) {
			console.log("[smart-compact] 没有需要摘要的消息，跳过");
			return {};
		}

		console.log(`[smart-compact] 接管: ${messagesToSummarize.length} 条消息`);

		try {
			const callLLM = createLLMCaller(ctx, config.intentModel);

			// ─── Phase 1: 意图总结 ───
			console.log("[smart-compact] Phase 1: 提取意图...");
			const nonToolText = extractNonToolText(messagesToSummarize, config);

			let intent: string;
			if (nonToolText.trim().length === 0) {
				intent = previousSummary ?? "(无上下文)";
			} else {
				intent = await summarizeIntent(nonToolText, previousSummary, callLLM, signal);
			}
			console.log(`[smart-compact] 意图: ${intent.slice(0, 100)}...`);

			// ─── Phase 2: 工具去留判断 ───
			console.log("[smart-compact] Phase 2: 工具去留...");
			const toolPairs = collectToolPairs(messagesToSummarize, config);
			console.log(`[smart-compact] 收集到 ${toolPairs.length} 个工具调用`);

			let verdicts: Map<string, boolean>;
			if (toolPairs.length === 0) {
				verdicts = new Map();
			} else {
				const filterCallLLM = config.filterModel
					? createLLMCaller(ctx, config.filterModel)
					: callLLM;
				const results = await filterTools(toolPairs, intent, config, filterCallLLM, signal);
				verdicts = new Map(results.map((v) => [v.toolCallId, v.keep]));
			}

			const keptCount = toolPairs.filter((p) => verdicts.get(p.toolCallId) !== false).length;
			console.log(`[smart-compact] 保留 ${keptCount}/${toolPairs.length} 个工具结果`);

			// ─── Phase 3: 构建压缩结果 ───
			let summary = intent;

			const keptPairs = toolPairs.filter((p) => verdicts.get(p.toolCallId) !== false);
			if (keptPairs.length > 0) {
				summary += "\n\n## Retained Tool Results\n";
				for (const p of keptPairs) {
					summary += `\n### [${p.toolName}] (${p.toolCallId})\n`;
					summary += `Args: ${p.argsSummary}\n`;
					summary += `Result:\n${p.resultText}\n`;
				}
			}

			// 文件操作信息
			const readFiles: string[] = (preparation as any).fileOps?.read
				? Array.from((preparation as any).fileOps.read)
				: [];
			const modifiedFiles: string[] = (preparation as any).fileOps?.edited
				? Array.from((preparation as any).fileOps.edited)
				: [];
			if (readFiles.length > 0 || modifiedFiles.length > 0) {
				summary += "\n\n## Files Tracked\n";
				if (readFiles.length > 0) summary += `Read: ${readFiles.join(", ")}\n`;
				if (modifiedFiles.length > 0) summary += `Modified: ${modifiedFiles.join(", ")}\n`;
			}

			console.log("[smart-compact] 完成");

			const result: CompactionResult = {
				summary,
				firstKeptEntryId,
				tokensBefore,
				details: { readFiles, modifiedFiles, keptTools: keptCount, totalTools: toolPairs.length },
			};

			return { compaction: result };
		} catch (err) {
			console.error(`[smart-compact] 失败，回退 pi 内置: ${err}`);
			return {};
		}
	});
}
