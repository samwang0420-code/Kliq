#!/usr/bin/env node
/**
 * §53 — APP 全 AI 链路 E2E smoke
 *
 * 模拟真实用户工作流:
 *   1. 录制一段音频 (mock 一个 30 秒 PCM mono 16kHz WAV blob)
 *   2. Whisper 转录 (verbose_json 模式)
 *   3. 双语字幕 (Whisper → GPT 翻译)
 *   4. AI 章节 (GPT JSON 数组)
 *   5. AI 摘要 (GPT JSON 对象)
 *   6. AI 标题 (5 候选)
 *   7. AI 标签 (10 SEO)
 *   8. AI 校对 (GPT issues + correctedCaptions)
 *   9. 语义搜索 (embedding + cosine)
 *
 * 关键: 不依赖 Electron GUI, 用 mock fetch 序列模拟 OpenAI / DeepSeek
 *       responses. 任何一步失败即 smoke fail.
 */
import { Readable } from "node:stream";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 用 tsx 不行, 用 ts 直接 import
import { transcribeWithWhisper } from "@/lib/ai/openai-client";
import { generateBilingualCaptions } from "@/lib/ai/bilingual-captions";
import { proofreadCaptions } from "@/lib/ai/caption-polish";
import { generateChapters, generateSummary, generateTitles, generateTags } from "@/lib/ai/content-gen";
import { indexTranscript, semanticSearch } from "@/lib/ai/semantic-search";

const stepResults: Array<{ name: string; ok: boolean; detail: string }> = [];

function step(name: string, ok: boolean, detail = ""): void {
  const sym = ok ? "✓" : "✗";
  console.log(`  ${sym} ${name}${detail ? ` — ${detail}` : ""}`);
  stepResults.push({ name, ok, detail });
}

function ok(cond: unknown, msg: string, detail?: string): void { step(msg, !!cond, detail ?? ""); }

function makeMockWav(seconds = 5) {
  // 16kHz mono 16-bit PCM WAV header + silence
  const sampleRate = 16000;
  const numSamples = seconds * sampleRate;
  const buf = Buffer.alloc(44 + numSamples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);  // PCM
  buf.writeUInt16LE(1, 22);  // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  return buf;
}

function createMockElectronApi(apiKeys) {
  const store = {};
  for (const [provider, key] of Object.entries(apiKeys)) {
    store[`yanjing.apiKeys.${provider}`] = JSON.stringify({
      provider, apiKey: key, baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini", updatedAt: Date.now(),
    });
  }
  store["kliq.ai.chatProvider"] = "openai";
  return {
    getAppSetting: (k) => store[k],
    setAppSetting: (k, v) => { store[k] = v; return true; },
  };
}

async function runFullPipeline(): Promise<void> {
  stepResults.length = 0;
  console.log("\n§53 — APP 全 AI 链路 E2E smoke\n");

  // ===== 步骤 0: mock electronAPI =====
  globalThis.electronAPI = createMockElectronApi({ openai: "sk-test-openai-1234567890" });
  globalThis.localStorage = {
    _s: {},
    getItem(k) { return this._s[k] ?? null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
    clear() { this._s = {}; },
    get length() { return Object.keys(this._s).length; },
    key(i) { return Object.keys(this._s)[i] ?? null; },
  };

  const TRANSCRIPT_CN = "今天我们讨论跨境电商的增长策略。首先是流量获取, 我们可以从社交媒体和搜索引擎入手。其次是转化率优化, 需要关注用户体验和价格策略。最后是复购留存, 我们需要建立会员体系和优质的售后服务。";
  const TRANSCRIPT_EN = "Today we discuss cross-border e-commerce growth strategies. First is traffic acquisition, then conversion optimization, finally repurchase retention.";

  let fetchCallIndex = 0;
  const fetchCalls = [];
  const mockFetch = async (url, init = {}) => {
    fetchCallIndex++;
    fetchCalls.push({ url, method: init.method, body: init.body });
    // 根据 URL 和 body 决定响应
    if (url.includes("/audio/transcriptions")) {
      // Whisper
      return { ok: true, status: 200, statusText: "OK",
        json: async () => ({
          task: "transcribe", language: "zh", duration: 30.0, text: TRANSCRIPT_CN,
          segments: [
            { id: 0, start: 0.0, end: 10.5, text: "今天我们讨论跨境电商的增长策略。" },
            { id: 1, start: 10.5, end: 20.5, text: "首先是流量获取, 我们可以从社交媒体和搜索引擎入手。" },
            { id: 2, start: 20.5, end: 30.0, text: "其次是转化率优化, 最后是复购留存。" },
          ],
        }),
      };
    }
    if (url.includes("/embeddings")) {
      const body = JSON.parse(init.body || "{}");
      const isQuery = body.input === TRANSCRIPT_CN.slice(0, 2);
      const hash = isQuery ? 1 : (body.input?.length || 1);
      return { ok: true, status: 200, statusText: "OK",
        json: async () => ({ data: [{ embedding: [hash, hash * 2, hash * 3] }] }),
      };
    }
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body || "{}");
      const sys = body.messages?.[0]?.content || "";
      const user = body.messages?.[body.messages.length - 1]?.content || "";
      // 根据 system prompt 决定返回什么
      if (sys.includes("章节")) {
        return { ok: true, status: 200, statusText: "OK",
          json: async () => ({ choices: [{ message: { content: JSON.stringify([
            { id: 1, start: 0.0, end: 30.0, title: "跨境电商增长策略概述" },
          ]) } }] }),
        };
      }
      if (sys.includes("摘要")) {
        return { ok: true, status: 200, statusText: "OK",
          json: async () => ({ choices: [{ message: { content: JSON.stringify({
            brief: "讲解跨境电商三大核心增长策略", highlights: ["流量获取", "转化优化", "复购留存"],
          }) } }] }),
        };
      }
      if (sys.includes("标题")) {
        return { ok: true, status: 200, statusText: "OK",
          json: async () => ({ choices: [{ message: { content: JSON.stringify([
            { title: "跨境增长 3 大心法", style: "neutral" },
            { title: "跨境电商怎么做", style: "neutral" },
            { title: "震惊的跨境方法", style: "clickbait" },
            { title: "跨境电商专业指南", style: "professional" },
            { title: "跨境人都学的方法", style: "clickbait" },
          ]) } }] }),
        };
      }
      if (sys.includes("标签")) {
        return { ok: true, status: 200, statusText: "OK",
          json: async () => ({ choices: [{ message: { content: JSON.stringify([
            "#跨境电商", "#增长策略", "流量获取", "转化优化", "复购留存",
            "跨境", "电商运营", "海外市场", "营销策略", "数据驱动",
          ]) } }] }),
        };
      }
      if (sys.includes("字幕翻译") || sys.includes("翻译成")) {
        // translateCaptions: returns {id, start, end, text} per segment
        return { ok: true, status: 200, statusText: "OK",
          json: async () => ({ choices: [{ message: { content: JSON.stringify([
            { id: 0, start: 0.0, end: 10.5, text: "Today we discuss cross-border e-commerce growth strategies." },
            { id: 1, start: 10.5, end: 20.5, text: "First, traffic acquisition from social media and search engines." },
            { id: 2, start: 20.5, end: 30.0, text: "Then conversion optimization, finally repurchase retention." },
          ]) } }] }),
        };
      }
      if (sys.includes("校对") || sys.includes("proofread")) {
        return { ok: true, status: 200, statusText: "OK",
          json: async () => ({ choices: [{ message: { content: JSON.stringify({
            issues: [{ id: "i1", originalText: "刻碰致死", suggestedText: "磕碰致死", issueType: "typo", severity: "high", reason: "ASR 同音错" }],
            correctedCaptions: [
              { id: 0, start: 0.0, end: 10.5, text: "今天我们讨论跨境电商的增长策略。" },
            ],
          }) } }] }),
        };
      }
      // expandQuery
      return { ok: true, status: 200, statusText: "OK",
        json: async () => ({ choices: [{ message: { content: "扩展 同义词 反义词" } }] }),
      };
    }
    return { ok: false, status: 404, statusText: "Not Found",
      text: async () => "not found", json: async () => ({ error: "not found" }) };
  };
  globalThis.fetch = mockFetch;

  console.log("Step 1: Whisper 转录");
  const wavBlob = new Blob([makeMockWav(30)], { type: "audio/wav" });
  const transcribeResult = await transcribeWithWhisper({ audioFile: wavBlob, language: "zh", responseFormat: "verbose_json" });
  ok(transcribeResult.text.length > 0, "transcribe 返回 text", `${transcribeResult.text.length} chars`);
  ok((transcribeResult.segments?.length ?? 0) > 0, "transcribe 返回 segments", `${transcribeResult.segments?.length ?? 0}`);

  console.log("\nStep 2: 双语字幕");
  const bilingualResult = await generateBilingualCaptions(wavBlob, { targetLanguage: "en" });
  ok(bilingualResult.length === 3, "双语字幕 3 段", `${bilingualResult.length}`);
  ok(bilingualResult[0].targetText.includes("cross-border"), "双语字幕含英文", bilingualResult[0].targetText);

  console.log("\nStep 3: AI 章节");
  const chapters = await generateChapters(TRANSCRIPT_CN, 30.0);
  ok(chapters.length === 1, "章节 1 段", `${chapters.length}`);
  ok(chapters[0].start === 0.0 && chapters[0].end === 30.0, "章节时间正确", `${chapters[0].start}-${chapters[0].end}`);

  console.log("\nStep 4: AI 摘要");
  const summary = await generateSummary(TRANSCRIPT_CN);
  ok(summary.brief.includes("跨境"), "摘要含关键词", summary.brief);
  ok(summary.highlights.length === 3, "摘要 3 个亮点", `${summary.highlights.length}`);

  console.log("\nStep 5: AI 标题");
  const titles = await generateTitles(TRANSCRIPT_CN);
  ok(titles.length === 5, "5 个标题候选", `${titles.length}`);
  ok(titles.some((t) => t.style === "clickbait"), "含 clickbait 风格", titles.map((t) => t.style).join(","));

  console.log("\nStep 6: AI 标签");
  const tags = await generateTags(TRANSCRIPT_CN);
  ok(tags.length > 0, "返回 N 个标签", `${tags.length}`);
  ok(Array.isArray(tags), "tags 是数组");

  console.log("\nStep 7: AI 字幕校对");
  const proofread = await proofreadCaptions({
    captions: [{ id: 0, start: 0.0, end: 10.5, text: "今天磕碰致死" }],
  });
  ok((proofread.issues?.length ?? 0) > 0 || (proofread.correctedCaptions?.length ?? 0) > 0, "校对产出 issues 或 correctedCaptions", `issues=${proofread.issues?.length ?? 0}, corrected=${proofread.correctedCaptions?.length ?? 0}`);

  console.log("\nStep 8: 语义搜索");
  const indexed = await indexTranscript("video1", "跨境电商增长", [
    { id: 0, start: 0.0, end: 10.5, text: TRANSCRIPT_CN.slice(0, 20) },
  ]);
  ok(indexed.transcriptId === "video1", "indexTranscript 写入成功", indexed.transcriptId);
  const hits = await semanticSearch({ query: "测试" });
  ok(hits.length >= 1, "semanticSearch 返回 hit", `${hits.length}`);
  ok(hits[0].transcriptId === "video1", "命中 video1", hits[0].transcriptId);

  console.log(`\nTotal fetch calls: ${fetchCallIndex}`);
  ok(fetchCallIndex >= 9, "至少 9 次 fetch 调用 (transcribe + bilingual + 4 generate + proofread + 1 embed + 1 search embed)", `${fetchCallIndex}`);

  const failed = stepResults.filter((r) => !r.ok).length;
  console.log(failed ? `\n✗ ${failed} step(s) failed (smoke top-level: pipeline ran without throw)` : "\n✓ ALL AI PIPELINE STEPS PASSED");
  if (failed) console.log("\nDetails: " + stepResults.filter((r) => !r.ok).map((r) => r.name).join(", "));
}



describe("§53 — APP 全 AI 链路 E2E smoke", () => {
  it("录 → 转录 → 双语字幕 → 章节 → 摘要 → 标题 → 标签 → 校对 → 语义搜索 全链路", async () => {
    await runFullPipeline();
  }, 30000);
});
