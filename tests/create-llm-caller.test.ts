/**
 * llm-caller.ts 测试 — createLLMCaller
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// mock pi-ai 的 completeSimple
const mockCompleteSimple = vi.hoisted(() =>
	vi.fn((_model: any, _msgs: any, opts: any) => {
		// 默认成功返回
		return Promise.resolve({
			stopReason: "end_turn",
			content: [{ type: "text", text: "LLM response" }],
			errorMessage: undefined,
		});
	}),
);
vi.mock("@earendil-works/pi-ai", () => ({
	completeSimple: mockCompleteSimple,
}));

import { createLLMCaller } from "../llm-caller";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

function makeMockCtx(overrides?: Partial<ExtensionContext>): ExtensionContext {
	const mockModel = { id: "test-model", provider: "test" } as any;
	return {
		model: mockModel,
		modelRegistry: {
			find: vi.fn().mockReturnValue(mockModel),
			getApiKeyAndHeaders: vi.fn().mockResolvedValue({
				ok: true,
				apiKey: "test-key",
				headers: {},
			}),
		},
		...overrides,
	} as any as ExtensionContext;
}

describe("createLLMCaller", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("使用 session model 调用 LLM", async () => {
		const ctx = makeMockCtx();
		const caller = createLLMCaller(ctx);
		const result = await caller("system prompt", "user prompt");

		expect(result).toBe("LLM response");
		expect(mockCompleteSimple).toHaveBeenCalledOnce();
		// 验证传给 completeSimple 的模型是 session model
		const callArgs = mockCompleteSimple.mock.calls[0];
		expect(callArgs[0]).toBe(ctx.model);
	});

	it("使用 modelId 查找指定模型", async () => {
		const ctx = makeMockCtx();
		const specificModel = { id: "cheap-model", provider: "test" } as any;
		(ctx.modelRegistry.find as any).mockReturnValue(specificModel);

		const caller = createLLMCaller(ctx, "test/cheap-model");
		await caller("system", "user");

		expect(ctx.modelRegistry.find).toHaveBeenCalledWith("test", "cheap-model");
		const callArgs = mockCompleteSimple.mock.calls[0];
		expect(callArgs[0]).toBe(specificModel);
	});

	it("modelId 找不到模型时回退到 session model", async () => {
		const ctx = makeMockCtx();
		(ctx.modelRegistry.find as any).mockReturnValue(undefined);

		const caller = createLLMCaller(ctx, "nonexistent/model");
		await caller("system", "user");

		const callArgs = mockCompleteSimple.mock.calls[0];
		expect(callArgs[0]).toBe(ctx.model);
	});

	it("model 无效时抛出错误", async () => {
		const ctx = makeMockCtx({ model: undefined } as any);
		const caller = createLLMCaller(ctx);

		await expect(caller("system", "user")).rejects.toThrow("模型不可用");
	});

	it("API key 不可用时抛出错误", async () => {
		const ctx = makeMockCtx();
		(ctx.modelRegistry.getApiKeyAndHeaders as any).mockResolvedValue({
			ok: false,
			error: "no key configured",
		});

		const caller = createLLMCaller(ctx);
		await expect(caller("system", "user")).rejects.toThrow("API key 不可用");
	});

	it("LLM 返回 error stopReason 时抛出错误", async () => {
		const ctx = makeMockCtx();
		mockCompleteSimple.mockResolvedValue({
			stopReason: "error",
			content: [],
			errorMessage: "rate limited",
		});

		const caller = createLLMCaller(ctx);
		await expect(caller("system", "user")).rejects.toThrow("LLM 调用失败");
	});

	it("正确提取 text content 并拼接", async () => {
		const ctx = makeMockCtx();
		mockCompleteSimple.mockResolvedValue({
			stopReason: "end_turn",
			content: [
				{ type: "text", text: "part1" },
				{ type: "image", url: "http://..." },
				{ type: "text", text: "part2" },
			],
			errorMessage: undefined,
		});

		const caller = createLLMCaller(ctx);
		const result = await caller("system", "user");
		expect(result).toBe("part1\npart2");
	});

	it("传入 abort signal 给 completeSimple", async () => {
		const ctx = makeMockCtx();
		const controller = new AbortController();
		const caller = createLLMCaller(ctx);

		await caller("system", "user", controller.signal);

		const callArgs = mockCompleteSimple.mock.calls[0];
		expect(callArgs[2].signal).toBe(controller.signal);
	});

	it("modelId 无斜杠时不查找 modelRegistry.find", async () => {
		const ctx = makeMockCtx();
		const caller = createLLMCaller(ctx, "invalid-no-slash" as any);
		await caller("system", "user");

		expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
		expect(mockCompleteSimple).toHaveBeenCalled();
	});
});
