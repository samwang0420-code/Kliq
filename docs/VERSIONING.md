# 版本管理与分支模型

> 本文是 Kliq 仓库的版本控制唯一约定。任何分支/tag 操作以本文为准。

## 1. 远端

| remote | 地址 | 权限 |
|---|---|---|
| `origin` | `https://github.com/samwang0420-code/Recordly.git` | 读写（自己的仓库） |
| `upstream` | `https://github.com/webadderallorg/Recordly.git` | 只读（上游素材源） |

凭据由 macOS Keychain 的 `osxkeychain` helper 提供，仓库内**不存任何 token**。

## 2. 分支：只保留两个

| 分支 | 用途 | 合并规则 |
|---|---|---|
| `main` | 稳定线，始终可发布 | 只接受来自 `dev` 的合并；每次合并打 tag |
| `dev` | 开发集成线 | 日常开发、上游 PR 移植、验收都在这里 |

临时分支（可选）：`feat/xxx`、`fix/xxx` —— 从 `dev` 切出，合并回 `dev` 后**立即删除**。

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
git checkout dev
git checkout tmp-pr996 -- <要移植的文件>                  # 只取需要的文件
# 人工适配差异后提交
git branch -D tmp-pr996                                  # 用完即删
```

注意**不能**用 `git diff origin/main tmp-pr996`：`origin/main` 现在已经是 Kliq
自己的代码，不是上游。

已删除的 18 个 `pr-*` 分支其 tip 已归档为 `refs/archive/pr-N`，可用
`git log --oneline refs/archive/pr-996` 找回，也可按上表重新 fetch。

## 4. 历史真相（必须知道）

`main` 是 W08 阶段**重建**出来的线性历史：45 个提交，root 为 `68ac10bc`，
**与上游 `origin/main`（上游 1148 提交历史）没有任何共同祖先**。

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
git fetch --no-tags <本仓库路径> "+refs/heads/main:refs/heads/main" "+refs/heads/dev:refs/heads/dev"
git fsck --strict --no-dangling main dev     # 必须无任何输出
```

本仓库自身跑 `git fsck` 会因 `refs/archive/_pre-repair-*`（旧损坏历史的归档）
而报错，**属预期**，不影响推送。

## 5. tag 规范

- 格式：`vX.Y.Z-kliq`，例 `v1.4.0-kliq`
- `v1.4.0-kliq` 是 Kliq 的**基线 tag**，指向 brand + 收费闸口 + 个人中心 那次提交
- 上游自带的 51 个 tag（`v1.4.0`、`v1.1.5` …）已于 2026-09-20 清理：
  它们全部指向上游历史，`v1.4.0` 是**上游的**发布，与 Kliq 代码无关，
  留着会让人误以为 Kliq 已经发过 v1.4.0。这些 tag 全部可从 `upstream` 恢复。
- 发版流程：

```bash
git checkout main && git merge --ff-only dev
git tag -a vX.Y.Z-kliq -m "Kliq vX.Y.Z"
git push origin main --follow-tags
```

## 6. 质量闸门

合并 `dev` → `main` 前必须全绿，缺一不许合：

```bash
npx tsc --noEmit      # 类型
npm run lint          # biome
npm test              # vitest
npm run i18n:check    # 语言包双向对齐
```

CI 见 `.github/workflows/quality.yml`（`push` 已覆盖 `main` 与 `dev`）。

## 7. 相关文档

- 上游 PR 素材台账与逐条结论：[upstream-pr-backlog.md](./upstream-pr-backlog.md)
