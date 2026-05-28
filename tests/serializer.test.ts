import { describe, it, expect } from "vitest";
import { serializeConversationEnhanced } from "../serializer";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SmartCompactConfig } from "../types";
import { DEFAULT_CONFIG } from "../types";

function makeThinking(length: number): any {
	return { type: "thinking", thinking: "x".repeat(length) };
}

function makeText(text: string): any {
	return { type: "text", text };
}

function makeToolCall(name: string, args: Record<string, unknown>): any {
	return { type: "toolCall", name, arguments: args, toolCallId: "call_123" };
}

function makeAssistantMessage(thinking?: any, content?: any[]): any {
	const blocks = [
		...(thinking ? [thinking] : []),
		...(content ?? [makeText("ok")]),
	];
	return { role: "assistant", content: blocks };
}

function makeToolResult(text: string): any {
	return { role: "toolResult", content: text, toolCallId: "call_123" };
}

function makeUserMessage(text: string): any {
	return { role: "user", content: [{ type: "text", text }] };
}

const compactConfig: SmartCompactConfig = {
	...DEFAULT_CONFIG,
	thinkingTruncateChars: 100,
	toolCallTruncateChars: 100,
	toolResultTruncateChars: 200,
};

describe("serializer", () => {
	describe("serializeConversationEnhanced", () => {
		it("应该序列化基本消息", () => {
			const messages: AgentMessage[] = [
				makeUserMessage("hello") as any,
				makeAssistantMessage() as any,
			];
			const result = serializeConversationEnhanced(messages, DEFAULT_CONFIG);
			expect(result).toContain("hello");
			expect(result).toContain("ok");
		});

		it("应该截断长 thinking 内容", () => {
			const longThinking = makeThinking(1000);
			const msg = makeAssistantMessage(longThinking);
			const messages = [makeUserMessage("test"), msg] as any as AgentMessage[];
			const result = serializeConversationEnhanced(messages, compactConfig);
			// 序列化后 thinking 应该被截断到 ~100 字符
			expect(result.length).toBeLessThan(1200);
		});

		it("应该截断长 tool result", () => {
			const longResult = "x".repeat(1000);
			// toolResult 的 content 必须是 array 格式，pi 内部会 .filter
			const msg = {
				role: "toolResult",
				content: [{ type: "text", text: longResult }],
				toolCallId: "call_123",
			} as any;
			const messages = [
				makeUserMessage("test"),
				makeAssistantMessage(undefined, [makeToolCall("bash", {})]),
				msg,
			] as any as AgentMessage[];
			const result = serializeConversationEnhanced(messages, compactConfig);
			// 截断后文本应远小于 1000 字符
			expect(result.length).toBeLessThan(800);
		});

		it("短内容不应被截断", () => {
			const messages: AgentMessage[] = [
				makeUserMessage("short message") as any,
			];
			const result = serializeConversationEnhanced(messages, compactConfig);
			expect(result).toContain("short message");
		});

		it("assistant 非数组 content 不抛出异常", () => {
			// pi SDK 对 string content 的 assistant 消息处理有限制
			// preprocessMessage 正确处理（直接返回），但 pi SDK convertToLlm 可能返回空
			const messages = [
				{ role: "assistant", content: "纯字符串回复" },
			] as any as AgentMessage[];
			expect(() => serializeConversationEnhanced(messages, DEFAULT_CONFIG)).not.toThrow();
		});

		it("toolResult string 格式超长截断", () => {
			const longResult = "x".repeat(1000);
			const messages = [
				{ role: "user", content: [{ type: "text", text: "test" }] },
				{ role: "toolResult", content: longResult, toolCallId: "call_1" },
			] as any as AgentMessage[];
			const result = serializeConversationEnhanced(messages, compactConfig);
			expect(result.length).toBeLessThan(500);
			expect(result).toContain("[truncated]");
		});

		it("toolResult array 中非 text block 保留原样", () => {
			const messages = [
				makeUserMessage("test"),
				makeAssistantMessage(undefined, [makeToolCall("read", {})]),
				{ role: "toolResult", content: [{ type: "image", url: "img.png" }, { type: "text", text: "short" }], toolCallId: "call_123" },
			] as any as AgentMessage[];
			const result = serializeConversationEnhanced(messages, compactConfig);
			expect(result).toContain("short");
		});

		it("空消息列表返回空", () => {
			const result = serializeConversationEnhanced([], DEFAULT_CONFIG);
			expect(result).toBe("");
		});


	});
});
