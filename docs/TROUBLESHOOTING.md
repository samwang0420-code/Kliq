# macOS 常见问题排查（Kliq 开发/分发）

## 1. 权限弹窗反复出现（已授权仍弹）

**症状**：录屏/麦克风权限在系统设置里已开启，Kliq 仍不停弹授权窗。

**根因**（2026-09-21 实锤，两层）：
- TCC 按 bundle id `tech.yanjingai.recorder` 记录授权；
- 当前发布包是 **ad-hoc 签名**，每次构建 cdhash 都会变化，TCC 旧授权对新构建无效；
- 机器上同时存在多份 Kliq.app（如 `/Applications` + `~/Applications` + `release/` 产物）时，
  授权的副本和运行的副本不是同一份 → 必然循环弹窗。
- **更隐蔽的一层：旧进程占位**。`open` 按 bundle id 激活应用——如果旧版本进程还在后台跑，
  `open /Applications/Kliq.app` 唤醒的其实是旧进程，弹窗图标/权限行为全是旧的。
  实测 1.4.0 旧进程后台常驻导致 reset 后仍反复弹窗、图标不更新。

**修复**：运行 `scripts/reset-macos-tcc.sh`（重置 TCC + 刷新图标缓存），然后重新授权一次。

**预防**：
- 机器上只保留一份安装：`/Applications/Kliq.app`。删掉 `~/Applications/Kliq.app`
  等旧副本；`release/` 下的产物不要日常运行。
- 根治要等 Apple Developer 证书（`electron-builder.json5` 配 `identity`）：
  正式签名后 Designated Requirement 稳定，重构建不再丢授权，同时也是公证分发的前提。

## 2. 系统设置/授权页里显示旧图标

**根因**：与 1 相同——TCC/LaunchServices 缓存了旧副本的图标（如 1.4.0 旧包的蓝色花图标）。

**修复**：`scripts/reset-macos-tcc.sh` 的第 2、3 步（lsregister -f + killall Dock Finder）。
若仍不刷新，移除旧副本后注销重新登录。

## 3. 换图标后 Dock 仍显示旧图标

```bash
killall Dock
```
（App 本体的 icon.icns 已确认打进 bundle，见 `icons/src/build-icons.py` 产物链。）
