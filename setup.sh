#!/usr/bin/env bash
# 言镜 — 本地一键脚本 (用户运行)
# 
# 这个脚本会:
# 1. 验证源码完整性
# 2. 初始化 git 仓库 (Python plumbing,绕过 macOS xcode license)
# 3. 创建初始 commit + tag
# 4. 输出下一步指引

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================================="
echo "  言镜 (Yanjing Recorder) — 本地设置脚本"
echo "================================================="
echo ""

# Step 1: 验证完整性
echo "▶ Step 1/4: 验证源码完整性..."
if ! bash verify.sh; then
    echo "❌ 验证失败"
    exit 1
fi
echo ""

# Step 2: 检查是否已有 .git
if [ -d ".git" ]; then
    echo "▶ Step 2/4: .git 已存在,跳过初始化"
else
    echo "▶ Step 2/4: 用 Python plumbing 创建 .git (绕过 macOS xcode license)..."
    python3 -c "
import os, hashlib, zlib, time

GIT_DIR = '.git'
os.makedirs(f'{GIT_DIR}/objects', exist_ok=True)
os.makedirs(f'{GIT_DIR}/refs/heads', exist_ok=True)
os.makedirs(f'{GIT_DIR}/refs/tags', exist_ok=True)
os.makedirs(f'{GIT_DIR}/hooks', exist_ok=True)
os.makedirs(f'{GIT_DIR}/info', exist_ok=True)

def sha1(d):
    return hashlib.sha1(d).hexdigest()

def gobj(t, d):
    h = f'{t} {len(d)}\0'.encode() + d
    c = zlib.compress(h)
    s = sha1(h)
    p = f'{GIT_DIR}/objects/{s[:2]}'
    os.makedirs(p, exist_ok=True)
    fp = f'{p}/{s[2:]}'
    if not os.path.exists(fp):
        with open(fp, 'wb') as f: f.write(c)
    return s

EX_DIRS = {'node_modules', '.git', 'release', 'dist', 'dist-electron', '.wrangler', 'user-data', 'recordings', '.cache', 'out', 'build', '.next', '.turbo', 'coverage'}
EX_FILES = {'.env', '.env.local', '.env.development', '.env.production'}

blobs = {}
for root, dirs, files in os.walk('.'):
    if '/.git' in root or root.startswith('./.git'):
        continue
    dirs[:] = [d for d in dirs if d not in EX_DIRS]
    for f in files:
        if f in EX_FILES: continue
        fp = os.path.join(root, f)
        rel = os.path.relpath(fp, '.').replace(os.sep, '/')
        if rel.endswith('.tar.gz'): continue
        try:
            with open(fp, 'rb') as fh: content = fh.read()
            if len(content) > 50*1024*1024: continue
            blobs[rel] = gobj('blob', content)
        except: pass

print(f'  ✅ {len(blobs)} blobs')

def mk_tree(entries):
    s = sorted(entries, key=lambda e: e[1] + ('/' if e[0] == 0o40000 else ''))
    d = b''
    for m, n, sh in s:
        d += f'{m:o} '.encode() + n.encode() + b'\0' + bytes.fromhex(sh)
    return gobj('tree', d)

root = {}
for p, sh in blobs.items():
    parts = p.split('/')
    cur = root
    for i, part in enumerate(parts):
        if i == len(parts) - 1:
            cur.setdefault('__files__', []).append((part, sh))
        else:
            cur = cur.setdefault(part, {})

def rec(n):
    e = [(0o100644, fn, sh) for fn, sh in n.get('__files__', [])]
    for nm, sb in n.items():
        if nm == '__files__': continue
        e.append((0o40000, nm, rec(sb)))
    return mk_tree(e)

rt = rec(root)
ts = int(time.time())
msg = ('tree ' + rt + '\nauthor YanJingAI <hi@yanjingai.tech> ' + str(ts) + ' +0800\n'
       'committer YanJingAI <hi@yanjingai.tech> ' + str(ts) + ' +0800\n\n'
       'feat(yanjing): v1.4.0-yanjing 初始版本\n\n'
       '- 品牌改名: recordly -> yanjing-recorder, productName=言镜\n'
       '- AGPL attribution + 行业热词 (5 领域词库)\n'
       '- AI 双语字幕 (Whisper + GPT-4)\n'
       '- Lemon Squeezy 许可证 + Cloudflare Pages\n'
       '- §213 极简风 CSS + GitHub Actions CI/CD\n\n'
       '基于 Recordly v1.4.0 (AGPL 3.0) 修改')
cs = gobj('commit', msg.encode())

with open(f'{GIT_DIR}/refs/heads/main', 'w') as f: f.write(cs + '\n')
with open(f'{GIT_DIR}/refs/tags/v1.4.0-yanjing', 'w') as f: f.write(cs + '\n')
with open(f'{GIT_DIR}/HEAD', 'w') as f: f.write('ref: refs/heads/main\n')
with open(f'{GIT_DIR}/config', 'w') as f:
    f.write('[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tignorecase = true\n[user]\n\tname = YanJingAI\n\temail = hi@yanjingai.tech\n[remote \"origin\"]\n\turl = https://github.com/yanjingai/recorder.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n')
with open(f'{GIT_DIR}/description', 'w') as f:
    f.write('言镜 (Yanjing Recorder) - AI 增强的开源屏幕录制器\n')
with open(f'{GIT_DIR}/packed-refs', 'w') as f:
    f.write('# pack-refs with: peeled fully-peeled sorted\n')

print(f'  ✅ Commit: {cs[:12]}')
print(f'  ✅ Tag: v1.4.0-yanjing')
"
fi
echo ""

# Step 3: 显示 commit info
echo "▶ Step 3/4: 当前 git 状态..."
COMMIT_SHA=$(python3 -c "
import os
p = '.git/refs/heads/main'
if os.path.exists(p):
    with open(p) as f:
        print(f.read().strip()[:12])
")
echo "  HEAD: main @ ${COMMIT_SHA}"
echo "  Tag:  v1.4.0-yanjing"
echo ""

# Step 4: 推送指引
echo "▶ Step 4/4: 下一步指引..."
echo ""
echo "================================================="
echo "  ✅ 本地仓库就绪 (commit + tag 已创建)"
echo "================================================="
echo ""
echo "📌 用户必做 (3 步):"
echo ""
echo "  1️⃣  创建 GitHub 仓库 (浏览器)"
echo "     https://github.com/new"
echo "     Repository name: yanjingai/recorder"
echo "     Public (AGPL 要求)"
echo "     不要勾选 'Initialize with README'"
echo ""
echo "  2️⃣  安装 git CLI 后推送"
echo "     # macOS 用户: 同意 xcode license 后 git CLI 才能用"
echo "     sudo xcodebuild -license"
echo "     git push https://github.com/yanjingai/recorder.git main v1.4.0-yanjing"
echo "     (用 HTTPS + Personal Access Token, 不用 SSH 更方便)"
echo ""
echo "  3️⃣  等 GitHub Actions 构建 (5-10 min)"
echo "     → GitHub 仓库 → Actions tab 看进度"
echo "     → 完成后从 Releases 下载 3 平台安装包"
echo ""
echo "📌 部署 (可选,1 小时):"
echo "     cd cloudflare/pages && npx wrangler pages deploy ."
echo ""
echo "📌 销售 (按 §252 验收):"
echo "     https://lemonsqueezy.com 创建 \$29 Pro 产品"
echo ""
echo "❓ 遇到问题? → cat FAQ.md"
