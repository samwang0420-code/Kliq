#!/usr/bin/env bash
# 言镜 (Yanjing Recorder) — 源码完整性验证脚本
#
# 用途: 用户解压 tarball 后,跑这个脚本确认所有关键文件就位
# 期望: 全部 ✅ OK,0 ❌ MISSING
#
# 用法: bash verify.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  言镜 (Yanjing Recorder) — 验证脚本"
echo "========================================="
echo ""
echo "工作目录: $SCRIPT_DIR"
echo ""

# 关键文件清单 (相对路径)
FILES=(
    # 配置
    "package.json"
    "electron-builder.json5"
    ".env.example"
    "LICENSE.md"
    # 文档
    "README.md"
    "README.zh-CN.md"
    "ATTRIBUTION.md"
    "CHANGELOG.md"
    "INSTALL.md"
    "CLOUD.md"
    "FAQ.md"
    # CI/CD
    ".github/workflows/release.yml"
    # 业务模块 (TypeScript)
    "src/lib/apiKeys.ts"
    "src/lib/hotwords.ts"
    "src/lib/license.ts"
    "src/lib/ai/openai-client.ts"
    "src/lib/ai/bilingual-captions.ts"
    "src/lib/ai/content-gen.ts"
    # 词库数据
    "src/data/hotwords/general.json"
    "src/data/hotwords/legal.json"
    "src/data/hotwords/medical.json"
    "src/data/hotwords/ecommerce.json"
    "src/data/hotwords/education.json"
    "src/data/hotwords/packs-index.json"
    # i18n (中文 + 英文至少)
    "src/i18n/locales/zh-CN/common.json"
    "src/i18n/locales/en/common.json"
    # Cloudflare 部署
    "cloudflare/api/license-validate.ts"
    "cloudflare/pages/index.html"
    # CSS 主题
    "src/index.css"
)

TOTAL=${#FILES[@]}
PASSED=0
FAILED=0

for f in "${FILES[@]}"; do
    if [ -f "$f" ]; then
        SIZE=$(stat -f '%z' "$f" 2>/dev/null || stat -c '%s' "$f" 2>/dev/null || echo "?")
        printf "  ✅ %-55s %8s bytes\n" "$f" "$SIZE"
        PASSED=$((PASSED + 1))
    else
        printf "  ❌ %-55s MISSING\n" "$f"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "========================================="
echo "结果: $PASSED / $TOTAL 文件就位"
if [ $FAILED -gt 0 ]; then
    echo "❌ $FAILED 文件缺失, 请重新解压 tarball 或联系 hi@yanjingai.tech"
    exit 1
else
    echo "✅ 全部 ${TOTAL} 个核心文件就位"
fi
echo "========================================="
echo ""
echo "下一步:"
echo "  1. 创建 GitHub 仓库: https://github.com/new (命名: yanjing-recorder)"
echo "  2. git init -b main && git add . && git commit -m 'feat(yanjing): initial'"
echo "  3. git push origin main && git tag v1.4.0-yanjing && git push origin v1.4.0-yanjing"
echo "  4. 等 5-10 分钟从 GitHub Releases 下载 .dmg / .exe / .AppImage"
echo ""
echo "详细步骤见 INSTALL.md / CLOUD.md / FAQ.md"
