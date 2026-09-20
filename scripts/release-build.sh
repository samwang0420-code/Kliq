#!/usr/bin/env bash
# Kliq一键 release 构建 (3 平台)
# 用户必做: 同意 xcodebuild license
set -euo pipefail

echo "=== 验证 xcodebuild license ==="
xcodebuild -version > /dev/null 2>&1 || {
    echo "❌ xcodebuild license 未同意"
    echo "  请跑: sudo xcodebuild -license"
    echo "  然后在 GUI 里 agree"
    exit 1
}
echo "✓ xcodebuild OK"

echo ""
echo "=== 选择平台 ==="
echo "  1) macOS (DMG + ZIP, x64 + arm64)"
echo "  2) Windows (NSIS, x64)"
echo "  3) Linux (AppImage, x64)"
echo "  4) 全部"
read -p "选 [1-4]: " PLATFORM

case $PLATFORM in
    1|4) ./node_modules/.bin/electron-builder --mac --x64 --arm64 --publish never ;;
esac
case $PLATFORM in
    2|4) ./node_modules/.bin/electron-builder --win --x64 --publish never ;;
esac
case $PLATFORM in
    3|4) ./node_modules/.bin/electron-builder --linux --x64 --publish never ;;
esac

echo ""
echo "=== 产物 ==="
ls -la release/
