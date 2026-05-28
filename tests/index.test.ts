import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// Mock 所有子模块
vi.mock("../intent-extractor.js", () => ({
	extractNonToolText: vi.fn(() => "user asked about foo"),
	summarizeIntent: vi.fn(async () => "user wants to understand foo"),
}));
vi.mock("../tool-filter.js", () => ({
	collectToolPairs: vi.fn(() => [
		{ toolCallId: "tc1", toolName: "read", argsSummary: "file.ts", resultText: "content" },
		{ toolCallId: "tc2", toolName: "bash", argsSummary: "ls", resultText: "output" },
	]),
	filterTools: vi.fn(async () => [
		{ toolCallId: "tc1", keep: true },
		{ toolCallId: "tc2", keep: false },
	]),
}));
vi.mock("../config.js", () => ({
	loadConfig: vi.fn(async () => ({ enabled: true, intentModel: "gpt-4", filterModel: "", maxToolResultChars: 2000 })),
	saveConfig: vi.fn(async () => {}),
}));
vi.mock("../llm-caller.js", () => ({
	createLLMCaller: vi.fn(() => vi.fn(async () => "llm response")),
}));

import { loadConfig, saveConfig } from "../config.js";
import { extractNonToolText, summarizeIntent } from "../intent-extractor.js";
import { collectToolPairs, filterTools } from "../tool-filter.js";

function mkCtx(overrides?: Partial<ExtensionCommandContext>): ExtensionCommandContext {
	return {
		ui: { notify: vi.fn(), custom: vi.fn() },
		compact: vi.fn(),
		...overrides,
	} as any;
}

function mkPi(): ExtensionAPI {
	const commands: Record<string, any> = {};
	const handlers: Record<string, any> = {};
	return {
		registerCommand: vi.fn((name: string, def: any) => { commands[name] = def; }),
		on: vi.fn((event: string, handler: any) => { handlers[event] = handler; }),
		_commands: commands,
		_handlers: handlers,
	} as any;
}

async function loadExtension(pi: ExtensionAPI) {
	const mod = await import("../index.js");
	await mod.default(pi);
}

describe("smart-compact index.ts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("/smart-compact 命令", () => {
		it("设置 forceRun 并调用 ctx.compact()", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._commands["smart-compact"].handler;
			const ctx = mkCtx();
			await handler("", ctx);
			expect(ctx.compact).toHaveBeenCalled();
		});

		it("compact 失败时不抛异常", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._commands["smart-compact"].handler;
			const ctx = mkCtx({ compact: vi.fn(() => { throw new Error("not available"); }) });
			await handler("", ctx);
			expect(ctx.compact).toHaveBeenCalled();
		});
	});

	describe("/smart-compact-config 命令", () => {
		it("auto — 开启自动接管", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._commands["smart-compact-config"].handler;
			const ctx = mkCtx();
			await handler("auto", ctx);
			expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
			expect(ctx.ui.notify).toHaveBeenCalled();
		});

		it("on — 等同 auto", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._commands["smart-compact-config"].handler;
			const ctx = mkCtx();
			await handler("on", ctx);
			expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
		});

		it("manual — 关闭自动接管", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._commands["smart-compact-config"].handler;
			const ctx = mkCtx();
			await handler("manual", ctx);
			expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
		});

		it("off — 等同 manual", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._commands["smart-compact-config"].handler;
			const ctx = mkCtx();
			await handler("off", ctx);
			expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
		});

		it("无参数 — 显示当前状态", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._commands["smart-compact-config"].handler;
			const ctx = mkCtx();
			await handler("", ctx);
			expect(loadConfig).toHaveBeenCalled();
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("smart-compact"), "info");
		});
	});

	describe("session_before_compact 事件", () => {
		it("禁用时返回空对象", async () => {
			vi.mocked(loadConfig).mockResolvedValue({ enabled: false, intentModel: "", filterModel: "", maxToolResultChars: 2000 } as any);
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._handlers["session_before_compact"];
			const result = await handler({ preparation: { messagesToSummarize: [] } }, mkCtx());
			expect(result).toEqual({});
		});

		it("无消息时返回空对象", async () => {
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._handlers["session_before_compact"];
			const result = await handler({
				preparation: { messagesToSummarize: [], tokensBefore: 100, firstKeptEntryId: "id1" },
			}, mkCtx());
			expect(result).toEqual({});
		});

		it("正常流程 — Phase 1+2 生成 summary", async () => {
			vi.mocked(loadConfig).mockResolvedValue({ enabled: true, intentModel: "gpt-4", filterModel: "", maxToolResultChars: 2000 } as any);
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._handlers["session_before_compact"];
			const result = await handler({
				preparation: {
					messagesToSummarize: [{ role: "user", content: "hello" }],
					tokensBefore: 5000,
					firstKeptEntryId: "entry1",
					fileOps: { read: new Set(["a.ts"]), edited: new Set(["b.ts"]) },
				},
				signal: undefined,
			}, mkCtx());

			expect(result.compaction).toBeDefined();
			expect(result.compaction.summary).toContain("user wants to understand foo");
			expect(result.compaction.summary).toContain("Retained Tool Results");
			expect(result.compaction.summary).toContain("Files Tracked");
			expect(result.compaction.details.readFiles).toEqual(["a.ts"]);
			expect(result.compaction.details.modifiedFiles).toEqual(["b.ts"]);
			expect(result.compaction.details.keptTools).toBe(1);
			expect(result.compaction.details.totalTools).toBe(2);
		});

		it("非工具文本为空时使用 previousSummary", async () => {
			vi.mocked(loadConfig).mockResolvedValue({ enabled: true, intentModel: "gpt-4", filterModel: "", maxToolResultChars: 2000 } as any);
			vi.mocked(extractNonToolText).mockReturnValue("   ");
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._handlers["session_before_compact"];
			const result = await handler({
				preparation: {
					messagesToSummarize: [{ role: "user", content: "hello" }],
					tokensBefore: 5000,
					firstKeptEntryId: "entry1",
					previousSummary: "之前的总结",
				},
				signal: undefined,
			}, mkCtx());

			expect(summarizeIntent).not.toHaveBeenCalled();
			expect(result.compaction.summary).toContain("之前的总结");
		});

		it("无工具调用时跳过 Phase 2", async () => {
			vi.mocked(loadConfig).mockResolvedValue({ enabled: true, intentModel: "gpt-4", filterModel: "", maxToolResultChars: 2000 } as any);
			vi.mocked(collectToolPairs).mockReturnValue([]);
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._handlers["session_before_compact"];
			const result = await handler({
				preparation: {
					messagesToSummarize: [{ role: "user", content: "hello" }],
					tokensBefore: 5000,
					firstKeptEntryId: "entry1",
				},
				signal: undefined,
			}, mkCtx());

			expect(filterTools).not.toHaveBeenCalled();
			expect(result.compaction.summary).not.toContain("Retained Tool Results");
		});

		it("异常时返回空对象（回退内置）", async () => {
			vi.mocked(loadConfig).mockResolvedValue({ enabled: true, intentModel: "gpt-4", filterModel: "", maxToolResultChars: 2000 } as any);
			vi.mocked(extractNonToolText).mockReturnValue("some user text");
			vi.mocked(summarizeIntent).mockRejectedValue(new Error("LLM error"));
			const pi = mkPi();
			await loadExtension(pi);
			const handler = (pi as any)._handlers["session_before_compact"];
			const result = await handler({
				preparation: {
					messagesToSummarize: [{ role: "user", content: "hello" }],
					tokensBefore: 5000,
					firstKeptEntryId: "entry1",
				},
				signal: undefined,
			}, mkCtx());

			expect(result).toEqual({});
		});


	});
});
