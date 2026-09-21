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

## 案例 2（2026-09-21）：开关显示已开、但仍弹权限提示（陈旧 TCC 条目）

**症状**：系统设置里「录屏」和「辅助功能」的 Kliq 开关都是开的，
但录制时仍弹"Screen Recording permission is still missing"，
且"想使用辅助功能"系统弹窗反复出现。

**根因**：TCC 条目绑定的是**旧构建的签名身份**（ad-hoc 每次构建都变）。
重新构建安装后，设置页里的开关还是旧条目的残影——显示"开"，实际对当前
二进制无效。图标总是显示当前 app 的图标，所以从设置页看不出区别。

**判别方法**（代码层面）：
- `preparePermissions`（useScreenRecorder.ts）顺序：先查录屏 → 再查辅助功能；
- 如果「辅助功能」弹窗出现了，说明**录屏探测已通过**，卡住的只是辅助功能；
- 弹窗文本来自 `src/hooks/useScreenRecorder.ts:642/665`。

**修复**：对应服务**关掉开关再打开**（强制刷新绑定），或：
`zsh scripts/reset-macos-tcc.sh`（杀进程 + 双服务重置 + 缓存刷新），
然后完全退出重开 Kliq 重新授权。

## 案例 3（2026-09-22）：从 DMG / 换构建身份运行时，开关怎么开都无效

**症状**：系统设置里 Kliq 的「录屏」和「辅助功能」开关都是开的，重置过
`tccutil`、开关也关过再开，录制时**仍然**弹 "Screen Recording permission is
still missing"。

**两个真实原因**（可同时存在）：

1. **跑的是磁盘映像里的旧包**。`/Volumes/Kliq 0.1.0-arm64/Kliq.app` 是 01:25
   构建、**ad-hoc 签名**、且**不含** codex 的 `desktopCapturer` 探测补丁——它用
   `getMediaAccessStatus` 判定，而该 API 在 macOS 26 上恒返回 denied，所以
   权限开得再对也永远报 missing。挂载的 DMG 卷里的 app 与安装副本是**两个不同
   签名的实体**，给 A 授权对 B 无效；而设置页里只显示一行 "Kliq"，看不出区别。
   旧卷还有一份 `Recordly 1.4.0-arm64`（bundle id `dev.recordly.app`）。

2. **Gatekeeper 转译运行**（App Translocation）。带隔离属性、且不在
   `/Applications` 下启动的 bundle 会从 `/private/var/folders/.../AppTranslocation/...`
   随机路径运行，每次启动路径都不同，TCC 授权永远绑不上。`/Applications` 下的
   正规安装不会有此问题（检查：`xattr -l /Applications/Kliq.app` 应无
   `com.apple.quarantine`）。

**现在的代码防护**（`electron/permissionStatus.ts` + `permissions.ts`）：

- 探测信号改为**取并集**：`getMediaAccessStatus` 或 `desktopCapturer.getSources`
  任一为 granted 即视为已授权，避免单一信号误判导致死循环弹窗；真无权限时改由
  实际录制报错暴露。
- 每次权限检查把真值写入 `<userData>/permission-diagnostics.log`
  （`~/Library/Application Support/Kliq/permission-diagnostics.log`），含
  api 状态、探测结果、探测到的源数量、错误、运行路径、是否在 /Volumes 或
  AppTranslocation、版本与 Electron 版本。系统日志读不了时，这是唯一可信证据。
- 弹窗文案带上诊断值 `(api=…, probe=…)`；若检测到 DMG/转译运行，直接把该提示
  放在最前面（因为这种情况下重新授权永远无效）。

**用户侧正确做法**：只保留 `/Applications/Kliq.app`，推出所有 DMG，然后在
设置里把两个开关**关掉再打开**，完全退出重开 Kliq。
