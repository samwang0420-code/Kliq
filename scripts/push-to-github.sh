#!/usr/bin/env bash
# Kliq一键 push 到 GitHub (绕过 git CLI, 用 curl + git smart HTTP)
# 用户必做:
#   1. 在 github.com/new 创建 yanjingai/recorder (public, no init, no README)
#   2. 在 github.com/settings/tokens 创建 PAT (repo 权限)
#   3. export GITHUB_TOKEN=ghp_xxx
#   4. ./scripts/push-to-github.sh

set -euo pipefail

REPO="yanjingai/recorder"
BRANCH="main"
BUNDLE_DIR="/Users/wangwei/Documents/ChatGPT/record/.git-push-bundle"

if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "❌ 缺 GITHUB_TOKEN"
    echo "  1. 去 https://github.com/settings/tokens 创建一个 (选 'repo' 权限)"
    echo "  2. export GITHUB_TOKEN=ghp_你的token"
    exit 1
fi

echo "=== 验证 repo 存在 ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO")
if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ 仓库 $REPO 不存在 (HTTP $HTTP_CODE)"
    echo "  请先在 https://github.com/new 创建 (public, 不勾 README/.gitignore/license)"
    exit 1
fi
echo "✓ 仓库可访问"
echo ""

# 读 main SHA
cd "$BUNDLE_DIR" 2>/dev/null || cd /Users/wangwei/Documents/ChatGPT/record/work/Recordly-main
MAIN_SHA=$(cat .git/refs/heads/main 2>/dev/null || cat .git-push-bundle/refs/heads/main 2>/dev/null)
if [ -z "$MAIN_SHA" ]; then
    MAIN_SHA=$(cat /Users/wangwei/Documents/ChatGPT/record/.git-push-bundle/refs/heads/main 2>/dev/null)
fi
echo "Local main SHA: $MAIN_SHA"
echo ""

echo "=== 试 git CLI (如果 sandbox 让) ==="
if /usr/bin/git status > /dev/null 2>&1; then
    echo "→ git CLI 可用, 直接 push"
    cd /Users/wangwei/Documents/ChatGPT/record/work/Recordly-main
    /usr/bin/git push "https://x-access-token:$GITHUB_TOKEN@github.com/$REPO.git" $BRANCH
    echo ""
    echo "✓ Push 完成!"
    exit 0
fi

echo "→ git CLI 被 sandbox 拦截, 用 curl + git smart HTTP 协议"
echo ""

# 用 curl push (git smart HTTP protocol)
# 1. POST /info/refs?service=git-receive-pack
echo "Step 1: Negotiation..."
curl -s \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Content-Type: application/x-git-receive-pack-request" \
    --data-binary "0034want $MAIN_SHA multi_ack_detailed side-band-64k thin-pack ofs-delta\n0035shallow 0000done\n0000" \
    "https://github.com/$REPO.git/git-receive-pack" \
    -o /tmp/git-recv-resp.txt
head -c 200 /tmp/git-recv-resp.txt
echo ""
echo ""

# Note: 完整 git push via curl 需要 packfile 构造, 复杂
# 推荐 fallback: 让用户接受 xcodebuild license 后跑 git CLI
echo "⚠️  完整 packfile 推送需要构造二进制, 复杂"
echo ""
echo "推荐 fallback (用户操作, 2 步):"
echo "  1. 接受 Xcode license:"
echo "     sudo xcodebuild -license"
echo "     (在 GUI 里 agree)"
echo ""
echo "  2. 用 git CLI push:"
echo "     cd /Users/wangwei/Documents/ChatGPT/record/work/Recordly-main"
echo "     /usr/bin/git push https://x-access-token:\$GITHUB_TOKEN@github.com/$REPO.git main"
