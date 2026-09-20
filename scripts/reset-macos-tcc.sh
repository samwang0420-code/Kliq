#!/bin/zsh
# Kliq macOS 权限循环弹窗 / 授权页旧图标 修复脚本
#
# 症状：
#   1. 录屏/麦克风权限已开，但 app 仍反复弹授权弹窗
#   2. 系统设置「隐私与安全性」里 Kliq 显示旧图标
#
# 根因：
#   - 机器上存在多份同 bundle id (tech.yanjingai.recorder) 的 Kliq.app
#     （/Applications、~/Applications、release/ 构建产物……）
#   - ad-hoc 签名每次构建 cdhash 都变 → TCC 里旧授权对新构建无效 → 反复弹
#   - 授权页图标取自旧副本缓存
#
# 用法：本机终端直接运行（不要 sudo）；跑完后重新打开 app 并重新授权一次。

BUNDLE_ID="tech.yanjingai.recorder"

echo "==> 1. 重置 TCC 录屏授权（仅 ${BUNDLE_ID}）"
tccutil reset ScreenCapture "${BUNDLE_ID}"

echo "==> 2. 重新注册 /Applications/Kliq.app（刷新 LaunchServices 图标缓存）"
lsregister() { /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister "$@"; }
lsregister -f /Applications/Kliq.app

echo "==> 3. 重启 Dock / Finder 刷新图标"
killall Dock Finder 2>/dev/null

echo "==> 完成。重新打开 Kliq，在弹窗里点「打开系统设置」重新允许即可。"
echo "提示：务必删掉多余的旧副本（如 ~/Applications/Kliq.app），只留 /Applications 一份，"
echo "     否则下次构建还会复发。"
