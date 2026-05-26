/**
 * llm-caller.ts 测试 — extractCurrentTask
 */

import { describe, it, expect, vi } from "vitest";
import { extractCurrentTask } from "../llm-caller";
import { DEFAULT_CONFIG } from "../config";

const mockLLMCaller = vi.fn<() => Promise<string>>();

describe("extractCurrentTask", () => {
	it("短消息应返回无法提取", async () => {
		const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }], timestamp: Date.now() }];
		const result = await extractCurrentTask(messages, mockLLMCaller as any, DEFAULT_CONFIG);
		expect(result).toBe("(无法提取当前任务)");
		expect(mockLLMCaller).not.toHaveBeenCalled();
	});

	it("长消息应调用 LLM 提取任务", async () => {
		const longText = "x".repeat(200);
		const messages = [
			{ role: "user" as const, content: [{ type: "text" as const, text: longText }], timestamp: Date.now() },
			{ role: "assistant" as const, content: [{ type: "text" as const, text: longText }], timestamp: Date.now() },
		];
		mockLLMCaller.mockResolvedValue("实现用户登录功能");
		const result = await extractCurrentTask(messages, mockLLMCaller as any, DEFAULT_CONFIG);
		expect(result).toBe("实现用户登录功能");
		expect(mockLLMCaller).toHaveBeenCalled();
	});

	it("LLM 调用失败应返回任务提取失败", async () => {
		const longText = "x".repeat(200);
		const messages = [
			{ role: "user" as const, content: [{ type: "text" as const, text: longText }], timestamp: Date.now() },
		];
		mockLLMCaller.mockRejectedValue(new Error("API error"));
		const result = await extractCurrentTask(messages, mockLLMCaller as any, DEFAULT_CONFIG);
		expect(result).toBe("(任务提取失败)");
	});
});
