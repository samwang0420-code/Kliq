/**
 * §51 Kliq — ui-polish.ts 端到端测试
 *
 * 覆盖: polishUIText / polishUITextBatch 的 prompt + 解析 + batch key=value
 */
import { describe, expect, it, beforeEach } from "vitest";
import { polishUIText, polishUITextBatch } from "./ui-polish";
import { setupElectronApi, mockFetchJson, getFetchMock } from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
});

describe("polishUIText", () => {
	it("happy path: 单条润色 → polishedText", async () => {
		mockFetchJson({ choices: [{ message: { content: "Save draft\n" } }] });
		const result = await polishUIText({ sourceText: "保存草稿", targetLanguage: "en" });
		expect(result.polishedText).toBe("Save draft");
		expect(result.originalText).toBe("保存草稿");
		expect(result.changes).toHaveLength(1);
	});

	it("prompt 包含 target language + style hint", async () => {
		mockFetchJson({ choices: [{ message: { content: "ok" } }] });
		await polishUIText({ sourceText: "x", targetLanguage: "ja", style: "friendly" });
		const body = JSON.parse((getFetchMock().mock.calls[0] as [string, RequestInit])[1].body as string);
		const userContent = body.messages.find((m: { role: string }) => m.role === "user").content;
		expect(userContent).toContain("ja");
		expect(userContent).toContain("友好");
	});
});

describe("polishUITextBatch", () => {
	it("key=value 多行 → 调 chatCompletion + 返回 changes", async () => {
		mockFetchJson({
			choices: [
				{
					message: {
						content: "save=Save\ncancel=Cancel",
					},
				},
			],
		});
		const result = await polishUITextBatch({
			sourceText: "save=保存\ncancel=取消",
			targetLanguage: "en",
		});
		expect(result.polishedText).toContain("save=Save");
		expect(result.changes).toHaveLength(2);
	});

	it("无 = 行 → fallback 到 polishUIText", async () => {
		mockFetchJson({ choices: [{ message: { content: "ok" } }] });
		const result = await polishUITextBatch({ sourceText: "no keys here", targetLanguage: "en" });
		expect(result.polishedText).toBe("ok");
	});
});
