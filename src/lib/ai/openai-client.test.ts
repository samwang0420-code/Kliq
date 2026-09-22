/**
 * §51 Kliq — openai-client.ts 端到端测试
 *
 * 覆盖:
 *   1. transcribeWithWhisper — FormData / Authorization / 错误处理
 *   2. chatCompletion — messages / model / response.choices[0]
 *   3. translateCaptions — caption 数组 → 译文数组
 *   4. deepseekChatCompletion — 不同 baseUrl
 *   5. 缺 key / 未配 provider → 抛友好错误
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
	transcribeWithWhisper,
	chatCompletion,
	translateCaptions,
	deepseekChatCompletion,
} from "./openai-client";
import {
	setupElectronApi,
	mockFetchJson,
	mockFetchError,
	getFetchMock,
} from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", deepseekKey: "ds-test", chatProvider: "openai" });
});

describe("transcribeWithWhisper", () => {
	it("happy path: 提交 audio + 收到 text", async () => {
		mockFetchJson({ text: "hello world", language: "en", duration: 2.5 });
		const result = await transcribeWithWhisper({
			audioFile: new Blob(["fake-audio"], { type: "audio/wav" }),
			responseFormat: "json",
		});
		expect(result.text).toBe("hello world");
		const call = getFetchMock().mock.calls[0] as [string, RequestInit];
		expect(call[0]).toBe("https://api.openai.com/v1/audio/transcriptions");
		expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
		expect(call[1].body).toBeInstanceOf(FormData);
	});

	it("verbose_json: 解析 language / duration / segments", async () => {
		mockFetchJson({
			text: "你好",
			language: "zh",
			duration: 5.1,
			segments: [{ id: 0, start: 0, end: 5, text: "你好" }],
		});
		const result = await transcribeWithWhisper({
			audioFile: new Blob(["x"]),
			responseFormat: "verbose_json",
		});
		expect(result.language).toBe("zh");
		expect(result.duration).toBe(5.1);
		expect(result.segments).toHaveLength(1);
	});

	it("未配 OpenAI key → 抛友好错误", async () => {
		setupElectronApi({ openaiKey: null, deepseekKey: null });
		await expect(
			transcribeWithWhisper({ audioFile: new Blob(["x"]) }),
		).rejects.toThrow(/Whisper 转录需要 OpenAI API key/);
	});

	it("5xx 错误 → 抛含 status 的错误", async () => {
		mockFetchError(503, "upstream down");
		await expect(
			transcribeWithWhisper({ audioFile: new Blob(["x"]) }),
		).rejects.toThrow(/Whisper API 失败 \(503\)/);
	});
});

describe("chatCompletion", () => {
	it("happy path: 提取 choices[0].message.content", async () => {
		mockFetchJson({
			choices: [{ message: { role: "assistant", content: "pong" } }],
		});
		const result = await chatCompletion({
			messages: [{ role: "user", content: "ping" }],
		});
		expect(result).toBe("pong");
	});

	it("带 model + temperature + maxTokens → 写入 body", async () => {
		mockFetchJson({ choices: [{ message: { content: "ok" } }] });
		await chatCompletion({
			messages: [{ role: "user", content: "x" }],
			model: "gpt-4o",
			temperature: 0.5,
			maxTokens: 200,
		});
		const body = JSON.parse((getFetchMock().mock.calls[0] as [string, RequestInit])[1].body as string);
		expect(body.model).toBe("gpt-4o");
		expect(body.temperature).toBe(0.5);
		expect(body.max_tokens).toBe(200);
	});

	it("未配任何后端 → 抛未配置错误", async () => {
		setupElectronApi({ openaiKey: null, deepseekKey: null });
		await expect(
			chatCompletion({ messages: [{ role: "user", content: "x" }] }),
		).rejects.toThrow(/未配置|未配|不可用|API key/);
	});
});

describe("translateCaptions", () => {
	it("happy path: 多 segments → 多译文 (TranscribeSegment[])", async () => {
		mockFetchJson({
			choices: [
				{
					message: {
						content: JSON.stringify([
							{ id: 1, start: 0, end: 1.5, text: "你好" },
							{ id: 2, start: 1.5, end: 3.2, text: "世界" },
						]),
					},
				},
			],
		});
		const result = await translateCaptions(
			[
				{ id: 1, start: 0, end: 1.5, text: "hello" },
				{ id: 2, start: 1.5, end: 3.2, text: "world" },
			],
			"zh",
		);
		expect(result).toEqual([
			{ id: 1, start: 0, end: 1.5, text: "你好" },
			{ id: 2, start: 1.5, end: 3.2, text: "世界" },
		]);
	});

	it("空 segments → 返回空数组, 不调 API", async () => {
		const fn = mockFetchJson({ choices: [{ message: { content: "[]" } }] });
		const result = await translateCaptions([], "zh");
		expect(result).toEqual([]);
		expect(fn).not.toHaveBeenCalled();
	});
});

describe("deepseekChatCompletion", () => {
	it("走 deepseek baseUrl + bearer", async () => {
		mockFetchJson({ choices: [{ message: { content: "DS answer" } }] });
		const result = await deepseekChatCompletion({
			messages: [{ role: "user", content: "ping" }],
		});
		expect(result).toBe("DS answer");
		const call = getFetchMock().mock.calls[0] as [string, RequestInit];
		expect(call[0]).toBe("https://api.deepseek.com/v1/chat/completions");
		expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer ds-test");
	});
});
