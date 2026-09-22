# 版本管理与分支模型

> 本文是 Kliq 仓库的版本控制唯一约定。任何分支/tag 操作以本文为准。

## 1. 远端

| remote | 地址 | 权限 |
|---|---|---|
| `origin` | `https://github.com/samwang0420-code/Kliq.git` | 读写（自己的仓库） |
| `upstream` | `https://github.com/webadderallorg/Recordly.git` | 只读（上游素材源） |

凭据由 macOS Keychain 的 `osxkeychain` helper 提供，仓库内**不存任何 token**。

### 1.1 仓库改名记录（2026-09-20）

`origin` 由 `samwang0420-code/Recordly` 改名为 `samwang0420-code/Kliq`。
品牌已经叫 Kliq，仓库名还留着 Recordly，会让「源码」入口与品牌脱节。
GitHub 对旧地址保留 **301 重定向**（按仓库 ID 维系），旧链接不会失效。

同批修正的仓库元信息：

| 字段 | 改前 | 改后 |
|---|---|---|
| `description` | 上游原文 *Create polished demo videos…* | Kliq 自己的话术 |
| `homepage` | `https://recordly.dev`（**上游官网**） | 清空，待填 Kliq 站点 |
| `topics` | 空 | 8 个（screen-recorder / video-editor / electron …） |

> `homepage` 原值指向上游站点，等于「点进自己仓库却跳去上游」。
>
> **已填（2026-09-20 晚）**：`homepage` = `https://yanjingai.tech`，`.env.example` 的
> `VITE_KLQ_SITE_URL` 同步落盘。站点源码在仓库内 `cloudflare/pages/`，部署配置见根目录
> `wrangler.toml`，许可证校验函数在 `functions/api/license-validate.ts`。
> 注意：`yanjingai.tech` 目前**尚未绑定**到 Pages 项目（DNS 无记录），
> 现网只有 `https://yanjingai-tech.pages.dev` 可达。

改名后必须同步的两处（已做）：

```bash
git remote set-url origin https://github.com/samwang0420-code/Kliq.git
```

- 代码内仓库地址常量 `KLQ_REPO_URL`（`src/lib/licenseConfig.ts`）—— 这是**唯一真源**，
  `KLQ_ISSUES_URL` 由它派生。此前 `licenseConfig.ts` 与 `TutorialHelp.tsx` 各写一份，
  导致改名后「一处地址对、一处 404」。

### 1.2 提交身份

本仓库使用**仓库级**身份（不动全局，避免影响其它项目）：

```
user.name  = Kliq
user.email = 242939827+samwang0420-code@users.noreply.github.com
```

用 GitHub noreply 地址而不是真实邮箱，避免邮箱被写进公开提交历史。
历史提交的作者仍是 `YanJingAI <hi@yanjingai.tech>`，**刻意不改** ——
改写作者要再动一次全部 commit SHA，代价与收益不成比例。


## 2. 分支：只保留 `main`（2026-09-22 起）

| 分支 | 用途 | 规则 |
|---|---|---|
| `main` | **唯一分支**，稳定线 | 改动直接提交到 `main`；发版打 tag |

2026-09-22 起**弃用 `dev` 开发集成线**：`dev` 已完全合并进 `main`
（`git rev-list --count main..dev` 为 0，且 `dev` 是 `main` 的祖先），本地与 `origin/dev` 均已删除。
需要找回只需 `git branch dev <sha>` —— 那些提交全都在 `main` 的历史里，永远可达。

单线模型的代价要说清楚：**`main` 上的每一个提交都应当是可发布的**，
不再有「先在 dev 集成、验证完再合并」这道缓冲。
所以**提交前必须本地跑通第 6 节的全部门禁**，别指望 CI 兜底（CI 是 push 之后才跑）。

临时分支（可选）：`feat/xxx`、`fix/xxx` —— 从 `main` 切出，合并回 `main` 后**立即删除**。

**不要**长期保留 `pr-*` 形式的分支，原因见第 3 节。

## 3. 上游 PR 素材的正确用法

Codex 时期用下面的方式把上游 PR 抓到本地：

```bash
git fetch upstream pull/996/head:pr-996 --depth=50
```

这类分支是**素材**，不是成果，有三个特征：

1. 浅克隆（`--depth=50`），与 `main` **没有共同祖先**，`git merge` / `git log` 跨分支都不通；
2. 内容是上游某个 PR 的整条分支，混着大量与目标改动无关的上游提交；
3. 正确的落地方式是**文件级移植**，不是 `cherry-pick`。

需要重新取用某个上游 PR 时：

```bash
git fetch upstream pull/996/head:tmp-pr996 --depth=50   # 重新抓取
git fetch upstream main --depth=1                       # 取上游 main 作比较基准
git diff FETCH_HEAD tmp-pr996 -- <目标目录>              # 看这个 PR 相对上游改了什么
git checkout main
git checkout tmp-pr996 -- <要移植的文件>                  # 只取需要的文件
# 人工适配差异后提交
git branch -D tmp-pr996                                  # 用完即删
```

注意**不能**用 `git diff origin/main tmp-pr996`：`origin/main` 现在已经是 Kliq
自己的代码，不是上游。

已删除的 18 个 `pr-*` 分支其 tip 已归档为 `refs/archive/pr-N`，可用
`git log --oneline refs/archive/pr-996` 找回，也可按上表重新 fetch。

## 4. 历史真相（必须知道）

`main` 是 W08 阶段**重建**出来的线性历史，root 为 `68ac10bc`，
**与上游 `origin/main`（上游 1148 提交历史）没有任何共同祖先**。
（修复完成时是 45 个提交；此后每次合并都会增长，**不要**把这个数字当常量去核对。）

推论：

- `git merge upstream/main`、`git rebase upstream/main`、`git pull upstream main`
  **一律不可用**，会引入无关历史或直接冲突到无法解析；
- 同步上游只有一条路：**文件级移植**（看 diff → 挑文件 → 人工适配）；
- `origin/main` 曾经只是上游镜像（零自有提交、作者全是上游开发者），
  2026-09-20 已强推为 Kliq 代码（`f096b879`）。上游旧镜像仍可从 `upstream` 恢复。

## 4.1 2026-09-20 历史修复（重要，务必读完）

**背景**：在这天之前，这个仓库的 `main` **从来没能推送成功过**。查证下来是
W08 阶段留下了两处结构性损坏，都不是网络问题。

### 损坏一：父指针指向一个 tree

```
f6cfae40 (main 的第 2 个提交)
  ├── tree   cc5073ab      正常
  └── parent 6fc52c09      异常！这是个 tree 对象，不是 commit
```

W08 当时发现后，只写了一个 `refs/replace/f6cfae40 → 544486af` 的替换引用去
**遮盖**它 —— 所以 `git log` 看起来一切正常。但 **`git pack-objects` 不认
`refs/replace`**，而 `push` / `bundle` / `fetch` 全都走它，于是：

```
error: Object 6fc52c09... not a commit
fatal: revision walk setup failed
```

**这就是"45 个提交从未推送成功"的真正原因**，不是网络、不是 token、不是权限。

### 损坏二：两个 tree 对象的条目顺序不合 git 规范

```
cc5073ab   electron/           排在 electron-builder.json5 之前
74fbaba3   audio/              排在 audio.test.ts 之前
```

git 的排序规则是「名字 + 终止符」逐字节比较，**目录的终止符是 `/`**，
所以 `.`（0x2E）< `/`（0x2F）—— `electron-builder.json5` 必须排在 `electron/` 前面。
手工构造 tree 时用了朴素的字符串排序，就会犯这个错。
GitHub 的 `index-pack` 会直接拒收：

```
remote: error: object cc5073ab...: treeNotSorted: not properly sorted
remote: fatal: fsck error in packed object
```

### 怎么修的

1. **父指针**：重放 main/dev 的提交链，把坏 parent 改回 `68ac10bc`。
2. **tree 排序**：自底向上重建违规 tree（先修子 tree，父 tree 的指针跟着更新），
   再重放提交链。

**blob 与 tree 的内容一字未改** —— 修复前后每个提交的文件树逐字节相同，
只有 commit 对象因 parent/tree 指针变化而级联换了 SHA。

- 旧 → 新 SHA 完整映射：`outputs/git-history-repair-mapping-2026-09-20.txt`
- 因此 **2026-09-20 之前所有文档里引用的 commit SHA 全部作废**，查旧 SHA 请用映射表
- 那个 `git replace` 遮盖引用**已删除**（保留它只会让问题在下次推送时再炸一次）

### 推送前必做自检

因为踩过这个坑，**任何推送前先跑这一条**：

```bash
# 在隔离仓库里检查即将推送的对象集合，等同 GitHub 的 index-pack 校验
rm -rf /tmp/gate && mkdir -p /tmp/gate && cd /tmp/gate && git init -q -b _s .
git fetch --no-tags <本仓库路径> "+refs/heads/main:refs/heads/main"
git fsck --strict --no-dangling main          # 必须无任何输出
```

本仓库现在自身跑 `git fsck --strict --no-dangling` 也是**零输出**（旧损坏对象已于
2026-09-20 经 `reflog expire` + `gc --prune=now` 回收，`.git` 从 943MB 降到 196MB）。
`refs/archive/pr-*` 是 18 个上游 PR 素材分支的 tip，属浅克隆素材，fsck 视其为合法。

## 5. tag 规范

- 格式：`vX.Y.Z-kliq`，例 `v1.4.0-kliq`
- `v1.4.0-kliq` 是 Kliq 的**基线 tag**，指向 brand + 收费闸口 + 个人中心 那次提交
- 上游自带的 51 个 tag（`v1.4.0`、`v1.1.5` …）已于 2026-09-20 清理：
  它们全部指向上游历史，`v1.4.0` 是**上游的**发布，与 Kliq 代码无关，
  留着会让人误以为 Kliq 已经发过 v1.4.0。这些 tag 全部可从 `upstream` 恢复。
- 发版流程：

```bash
git tag -a vX.Y.Z-kliq -m "Kliq vX.Y.Z"
git push origin main --follow-tags
```

## 6. 质量闸门

提交到 `main` 前必须全绿，缺一不许提交：

```bash
npx tsc --noEmit      # 类型
npm run lint          # biome
npm test              # vitest
npm run i18n:check    # 语言包双向对齐
```

CI 见 `.github/workflows/quality.yml`（`push` 覆盖 `main`，`pull_request` 全分支都跑）。

## 7. 相关文档

- 上游 PR 素材台账与逐条结论：[upstream-pr-backlog.md](./upstream-pr-backlog.md)
