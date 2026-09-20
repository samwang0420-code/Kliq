# Changelog — Kliq (Kliq)

所有相对于上游 [Recordly v1.4.0](https://github.com/webadderallorg/Recordly) 的变更都记录在此。

---

## [Unreleased] - 2026-09-18+

### Stage 1 — 项目骨架 + 品牌改名
- 改名 `recordly` → `kliq-recorder`
- `productName` → "Kliq"
- `appId` → `tech.yanjingai.recorder`
- 添加 `ATTRIBUTION.md` (AGPL 合规声明)
- 添加 `.env.example` (OPENAI_API_KEY 等环境变量)
- 添加 `src/lib/apiKeys.ts` (本地 API key 管理模块)
- 修改 `README.md` + `README.zh-CN.md` (品牌段 + What's new 段)
- 修改 `.gitignore` (新增 .env / .wrangler / release/ 等条目)
- 修改 `electron-builder.json5` (productName / appId / artifactName / CFBundleDocumentTypes / publish 移除)

### Stage 2 — 中文 UI + 极简风 _(即将开始)_

### Stage 3 — 行业热词 _(即将开始)_

### Stage 4 — AI 双语字幕 (Whisper + GPT-4) _(即将开始)_

### Stage 5 — AI 章节 / 摘要 / 标题 / 标签 / 社媒文案 _(即将开始)_

### Stage 6 — Lemon Squeezy + Stripe 支付 _(即将开始)_

### Stage 7 — electron-builder 打包 _(即将开始)_

---

## 基于上游 Recordly v1.4.0

所有上游 Recordly v1.4.0 的功能均保留:
- 整屏 / 窗口录制 + 三平台 native helper
- 自动缩放 + 光标润色 + 样式化背景
- 摄像头气泡叠加 (9 子功能)
- 完整时间线编辑 (zoom / trim / speed / annotations / crop)
- 光标 8 子功能 (平滑 / 模糊 / bounce / sway / loop)
- 帧样式 10 子功能
- MP4 / GIF 导出 + NVIDIA CUDA compositor
- SRT / VTT 字幕导出 + auto-captions
- 扩展市场 (Marketplace) + 6 类扩展
- 995 tests (上游)
- 完整 README (i18n: zh-CN / ru / it)

详见 [ATTRIBUTION.md](./ATTRIBUTION.md)。
