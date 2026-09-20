# Kliq (Kliq) — 安装与构建指南

## 重要说明:本仓库的打包限制

> ⚠️ **本仓库的 source tarball 不包含可执行的 .dmg / .exe / AppImage。**
>
> **原因**: 打包需要以下环境之一,本仓库未配置:
> - **macOS .dmg / .app**: 需要 Xcode + xcodebuild license (用户机器未启用)
> - **Windows .exe**: 需要 Windows 机器 + electron-builder Windows target
> - **Linux AppImage**: 需要 Linux 工具链 (推荐用 GitHub Actions 自动构建)
>
> **解决方案**: 本项目配置了 GitHub Actions 工作流 (`.github/workflows/`),
> 在 GitHub 仓库中 push tag `v1.4.0-kliq` 即可触发跨平台自动构建,
> 然后从 GitHub Releases 下载对应平台的可执行文件。

---

## 1. 源码安装 (任何平台)

### 前置条件
- **Node.js**: 20+ (推荐 22 LTS)
- **npm**: 10+ 或 **pnpm** 8+
- **操作系统**: macOS 12+ / Windows 10+ / Linux (Ubuntu 20.04+)

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/yanjingai/recorder.git
cd recorder

# 2. 安装依赖 (~500MB)
npm install

# 3. 开发模式
npm run dev

# 4. 打包 (本机平台)
npm run build:mac      # macOS → .dmg + .zip (需 xcode license)
npm run build:win      # Windows → .exe (需 wine 或在 Windows 跑)
npm run build:linux    # Linux → .AppImage
```

### 首次运行

1. 启动后,**Settings → AI → Configure API Key**
2. 填入你的 OpenAI API key (https://platform.openai.com/api-keys)
3. 选择行业热词域 (general / legal / medical / ecommerce / education)
4. 录制后 → AI 双语字幕 / AI 章节 / AI 摘要

---

## 2. GitHub Actions 跨平台构建 (推荐)

我们已经配置了 `.github/workflows/release.yml`,push tag 后自动构建。

```bash
git tag v1.4.0-kliq
git push origin v1.4.0-kliq
```

3 平台并行构建,产物在 GitHub Releases:
- `Kliq-v1.4.0-kliq-x64.dmg` (Intel Mac)
- `Kliq-v1.4.0-kliq-arm64.dmg` (Apple Silicon Mac)
- `Kliq-v1.4.0-kliq-windows-x64.exe` (Windows)
- `Kliq-v1.4.0-kliq-linux-x64.AppImage` (Linux)

---

## 3. Cloudflare Pages 部署 (营销页)

`./cloudflare/pages/index.html` 是静态营销页,可直接部署到 Cloudflare Pages:

```bash
cd cloudflare/pages
npx wrangler pages deploy . --project-name yanjingai-tech
```

部署后访问: `https://yanjingai.tech`

---

## 4. Lemon Squeezy 许可证激活流程

1. 用户访问 `https://yanjingai.lemonsqueezy.com/checkout/buy/yanjing-pro`
2. 支付 $29 → 收到 license key (格式 `kliq-pro-{8 位 hex}`)
3. 在 app 内 **Settings → License → Enter license key**
4. 客户端调 `functions/api/license-validate.ts` 校验
5. 校验通过 → 标记为 Pro, 解锁全部 AI 功能

---

## 5. 已知限制 (按 §218 不主动改无关 bug)

| 项 | 状态 | 影响 |
|---|---|---|
| 上游 Recordly whisper.cpp 本地推理 | 保留 | 不与 OpenAI API 冲突, 用户可选 |
| 上游 CUDA compositor | 保留 | Windows + NVIDIA 显卡加速 |
| macOS code signing | 未配置 | 用户需手动允许运行未签名应用 |
| 自动更新 (auto-updater) | 未启用 | 用户手动下载新版本 |

---

## 6. 验证脚本

```bash
# 编译检查
npm run typecheck  # 等价于 tsc --noEmit

# Lint
npm run lint

# 单元测试
npm test

# 完整构建 (需相应平台工具链)
npm run build
```

---

## 关联文档

- [README.md](./README.md) - 项目介绍
- [ATTRIBUTION.md](./ATTRIBUTION.md) - AGPL 合规声明
- [CHANGELOG.md](./CHANGELOG.md) - 变更记录
- [CLOUD.md](./CLOUD.md) - Cloudflare Pages 部署
