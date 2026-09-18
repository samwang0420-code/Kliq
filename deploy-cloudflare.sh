#!/usr/bin/env bash
# 言镜 — Cloudflare Pages 一键部署脚本
#
# 用法:
#   1. 登录 https://dash.cloudflare.com/profile/api-tokens
#   2. 创建 Token: Edit Cloudflare Pages 权限
#   3. export CF_API_TOKEN="你的 token"
#   4. export CF_ACCOUNT_ID="你的 account ID (32 位 hex)"
#   5. bash deploy-cloudflare.sh

set -e

if [ -z "$CF_API_TOKEN" ]; then
    echo "❌ CF_API_TOKEN 未设置"
    echo ""
    echo "步骤:"
    echo "  1. 打开 https://dash.cloudflare.com/profile/api-tokens"
    echo "  2. Create Token → Edit Cloudflare Pages"
    echo "  3. export CF_API_TOKEN=你的token"
    echo ""
    exit 1
fi

if [ -z "$CF_ACCOUNT_ID" ]; then
    echo "❌ CF_ACCOUNT_ID 未设置"
    echo ""
    echo "步骤:"
    echo "  1. 打开 https://dash.cloudflare.com"
    echo "  2. 右侧 Workers & Pages → 复制 Account ID"
    echo "  3. export CF_ACCOUNT_ID=你的32位hex"
    echo ""
    exit 1
fi

echo "================================================="
echo "  言镜 — Cloudflare Pages 一键部署"
echo "================================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Step 1: 准备部署目录
echo "▶ Step 1/5: 准备部署目录..."
DEPLOY_DIR="$SCRIPT_DIR/deploy-tmp"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# 复制 cloudflare/pages 内容
cp -r cloudflare/pages/* "$DEPLOY_DIR/"
echo "  ✅ 复制 cloudflare/pages/* 完成"

# 复制 API Functions (CF Pages 标准约定: functions/<route>.ts 自动绑定到 /<route>)
# 例如 functions/api/license-validate.ts -> POST /api/license-validate
if [ -d "functions" ]; then
    cp -r functions "$DEPLOY_DIR/"
    echo "  ✅ 复制 functions/* 完成 (CF Pages Functions 路由约定)"
fi

# Step 2: 安装 wrangler
echo ""
echo "▶ Step 2/5: 安装 wrangler..."
if ! command -v wrangler &> /dev/null; then
    npm install -g wrangler
    echo "  ✅ wrangler 已安装"
else
    echo "  ⏭️  wrangler 已存在"
fi

# Step 3: 检查项目是否存在
echo ""
echo "▶ Step 3/5: 检查/创建 Cloudflare Pages 项目..."
PROJECT_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/yanjingai-tech")

if [ "$PROJECT_EXISTS" = "200" ]; then
    echo "  ⏭️  yanjingai-tech 项目已存在"
else
    echo "  → 创建 yanjingai-tech 项目..."
    curl -s -X POST \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects" \
        -d '{"name":"yanjingai-tech","production_branch":"main"}' | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if d.get('success'):
        print('  ✅ yanjingai-tech 项目已创建')
    else:
        print(f'  ❌ 创建失败: {d.get(\"errors\", [{}])[0].get(\"message\", \"unknown\")}')
        sys.exit(1)
except Exception as e:
    print(f'  ❌ JSON 解析失败: {e}')
    sys.exit(1)
"
fi

# Step 4: 部署
echo ""
echo "▶ Step 4/5: 部署到 Cloudflare Pages..."
cd "$DEPLOY_DIR"
npx wrangler pages deploy . \
    --project-name=yanjingai-tech \
    --branch=main \
    --commit-dirty=true 2>&1 | tail -10

# Step 5: 输出部署结果
echo ""
echo "▶ Step 5/5: 部署完成!"
echo ""
echo "================================================="
echo "  ✅ 部署成功"
echo "================================================="
echo ""
echo "📌 下一步 (人工操作):"
echo ""
echo "  1️⃣  绑定自定义域名 yanjingai.tech"
echo "     Cloudflare Dashboard → Pages → yanjingai-tech"
echo "     → Custom domains → Set up a custom domain"
echo "     → 输入 yanjingai.tech → Activate"
echo ""
echo "  2️⃣  配置环境变量 (用于 Lemon Squeezy 校验)"
echo "     Dashboard → yanjingai-tech → Settings → Environment variables"
echo "     Production → Add variable:"
echo "       LEMON_SQUEEZY_API_KEY = 你的 LS API key"
echo "       LEMON_SQUEEZY_STORE = 你的 store ID"
echo "       LEMON_SQUEEZY_PRODUCT_ID = 你的 product ID"
echo ""
echo "  3️⃣  访问部署后的站点"
echo "     https://yanjingai-tech.pages.dev  (临时 URL)"
echo "     https://yanjingai.tech  (绑定后)"
echo ""
echo "❓ 遇到问题? → cat FAQ.md"
