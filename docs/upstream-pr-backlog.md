# 上游 PR 素材台账

> 记录 Codex 时期抓取过的上游 PR 素材，以及每一条的最终结论。
> 分支已清理（见 [VERSIONING.md](./VERSIONING.md) 第 3 节），此处保留结论供后续取用。
> 台账截止：2026-09-20。

> [!warning] SHA 已于 2026-09-20 重新映射
> 本表原先记录的是**历史修复之前**的 SHA。那次修复重放了整条提交链（blob 内容
> 一字未改，只有 SHA 变了），旧值在本仓库中**已全部失效**，`git show <旧SHA>` 会直接报
> `unknown revision`。已按 `VERSIONING.md` §4.1 的映射逐条换成本仓库现存 SHA，
> 并逐条用 `git merge-base --is-ancestor` 验证均在 `main` 上。
>
> 若在别处（含 Obsidian 归档）看到 `89d29eea` / `870d97b0` / `d7caab17` / `19bd7cae`
> 等旧值，一律视为**无效**，按本表新值取用。

## 一、已落地进 main（9 条）

| PR | 内容 | main 中的落地提交 |
|---|---|---|
| #421 / #422 | Windows 窗口级原生捕获 | `7fb7ef7d` |
| #518 | Linux X11 recording overlay 输入 | `75717033` |
| #640 | 跟随光标裁剪 + 文字焦点 / text-zoom | `199eaf25` |
| #672 | 导出渐变背景渲染错误 | `29f18d7c` |
| #767 | Linux 不再强制 `use-gl=egl`（AppImage GPU 崩溃） | `f03c75a9` |
| #835 | 摄像头背景虚化 | `138d93b7` |
| #863 | Linux HUD / Wayland resize anchor / Hyprland 光标遥测 | `343fb7ed`、`e2ae1f5d` |
| #951 | Linux Pixi WebGPU batch shader 不匹配 | `ed20a163` |
| #996 相关 | 中文 i18n 覆盖（实际由我方自有翻译工作完成，见下） | `befda693`、`2dbfcac6` |

## 二、未落地（9 条）——逐条结论

这 9 条**没有一条是"可直接合并"的**。上游 PR 与我方 fork 已经分叉到不同代码结构，
直接 `cherry-pick` 会引入坏代码。逐条核实结果：

| PR | 上游内容 | 核实结论 | 处置 |
|---|---|---|---|
| **#695** | macOS 系统+麦克风双重收音（`diagnostics.ts` +2 行） | **方向相反，采纳会引入 bug**。我方 `getCompanionAudioFallbackInfo` 里对同一根因已有**刻意相反**的设计：注释明确写"内联 mp4 轨道只含系统声（采集时 helper 跳过麦克风），只返回视频会丢掉麦克风"，因此返回两个 mac sidecar。上游 PR 的结论是"内联轨道已含 mic，只返回视频" | **不采纳** |
| **#726** | `SettingsPanel.tsx` 未闭合 JSX | main 里该处是 `<SectionLabel>{tSettings("sections.frame","Frame")}</SectionLabel>`，结构不同、**不存在该 bug** | **不适用** |
| **#595** | zh-CN 补漏翻译（短词、`nativeCaptureUnavailable`） | 已覆盖：`nativeCaptureUnavailable` 在 `zh-CN/editor.json:136` 已存在；要修的短词串全部不存在 | **已覆盖** |
| **#710** | ko / nl / pt-BR 乱码与缺变音符（CodeRabbit 反馈） | 已覆盖：ko 的乱码串（`령이 탭이`/`훈레이션`/`팔스로`）、nl 的 `cursorbeweiging`、pt-BR 的 `Predefinicoes`/`Animacao` **在 main 中全部零命中** | **已覆盖** |
| **#527** | zh-TW 繁体语言包改进（8 个 namespace） | 我方 zh-TW 已按**自有 key 集**重写（W19 达成 10 语言 100% parity）。上游版针对旧 key 集，且含我方不存在的 `extensions` namespace | **不适用**（如需再翻，按我方 key 集重做） |
| **#996** | 保留 source trigger 里的窗口标题 | 目标文件 `src/components/launch/sourceLabel.ts` **我方不存在**，`src/components/launch/` 结构完全不同 | **需移植**（非合并） |
| **#580** | click-sound 导出对齐 | 我方**整体未采纳该子系统**：`src/lib/extensions/` 不存在、`cursorClick` 音频代码零命中（只有 `cursorClickBounce` 这类动效参数，是另一回事）。不是修 bug，是缺一个子系统 | **属新功能**，需评估是否要做 |
| **#664** | 印尼语（id）语言包 | 我方无 `id` 语言。上游版含 8 个 namespace（含 `extensions`），我方只有 7 个 | **需按我方 key 集重译** |
| **#734** | 波兰语（pl）语言包 | 同上 | **需按我方 key 集重译** |

## 三、对早期文档的更正

早期文档 `outputs/17-…真痛点清单` 第 418 行写着「✅ W17 Click-sound export parity(#580)」、
W19 声称「8 语言打包完成」，但 `git log main` 中**没有任何对应痕迹**，代码里也
零命中。属于**文档完工假象**（与历史上的 fake commit 教训同类）。

不过经逐条核实，其中 #595 / #710 要修的问题**确实已经不存在**（由我方自有翻译工作覆盖），
所以实质无损失；真正缺失的是 #664/#734 两个语言包与 #580 整个 click-sound 子系统。

## 四、重新取用方式

```bash
git fetch upstream pull/<编号>/head:tmp-pr<编号> --depth=50
git fetch upstream main --depth=1
git diff FETCH_HEAD tmp-pr<编号> -- src/     # 与「上游 main」比，不是与 origin/main 比
```

（`origin/main` 现在是 Kliq 自己的代码，不再是上游镜像。）
