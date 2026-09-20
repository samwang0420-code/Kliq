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
git diff origin/main tmp-pr996 -- <目标目录>              # 看上游到底改了什么
git checkout dev
git checkout tmp-pr996 -- <要移植的文件>                  # 只取需要的文件
# 人工适配差异后提交
git branch -D tmp-pr996                                  # 用完即删
```

已删除的 18 个 `pr-*` 分支其 tip 已归档为 `refs/archive/pr-N`，可用
`git log --oneline refs/archive/pr-996` 找回，也可按上表重新 fetch。

## 4. 历史真相（必须知道）

`main` 是 W08 阶段**重建**出来的线性历史：45 个提交，root 为 `68ac10bc`，
**与上游 `origin/main`（上游 1148 提交历史）没有任何共同祖先**。

推论：

- `git merge upstream/main`、`git rebase upstream/main`、`git pull upstream main`
  **一律不可用**，会引入无关历史或直接冲突到无法解析；
- 同步上游只有一条路：**文件级移植**（看 diff → 挑文件 → 人工适配）；
- `refs/replace/f6cfae40…` 是 W08 修复 broken commit 时留下的替换引用，
  **不要删除**，删掉会让历史里出现一个坏提交；
- `origin/main` 曾经只是上游镜像（零自有提交），2026-09-20 已改为承载 Kliq 代码。

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
