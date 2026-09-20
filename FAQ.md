# Kliq (Kliq) — FAQ

> 常见问题与解决方案。遇到问题时,先看这里。

---

## Q1: tarball 里为什么没有 .dmg / .exe / AppImage?

**A**: 这是 **有意为之**,不是漏发。

**原因**:
- macOS `.dmg` 需要 `xcodebuild` + Apple Developer ID + codesign (本机无 license)
- Windows `.exe` 需要 Windows 工具链 (本机是 macOS)
- Linux AppImage 需要 wine 或 Linux 工具链

**解决方案**:
1. **GitHub Actions 自动构建 (推荐)**:
   ```bash
   git init -b main
   git add . && git commit -m "feat(yanjing): initial"
   git remote add origin git@github.com:yanjingai/recorder.git
   git push -u origin main
   git tag v1.4.0-kliq
   git push origin v1.4.0-kliq
   ```
   等 5-10 分钟,在 GitHub Releases 下载 `.dmg` / `.exe` / `.AppImage`

2. **本机 macOS 构建**:
   ```bash
   sudo xcodebuild -license    # 同意 Xcode license
   npm install
   npm run build:mac           # 产出 .dmg
   ```

3. **本机 Linux 构建**:
   ```bash
   npm install
   npm run build:linux         # 产出 .AppImage
   ```

---

## Q2: npm install 卡住 / 失败

**A**: 网络问题。500+ MB 依赖需要稳定网络。

**解决**:
```bash
# 切换 npm 镜像源
npm config set registry https://registry.npmmirror.com
npm install

# 或用 pnpm (更快)
npm install -g pnpm
pnpm install
```

---

## Q3: build:mac 失败 "xcodebuild license"

**A**: 同意 Xcode license 即可。

```bash
sudo xcodebuild -license
# 阅读 → 输入 agree → Enter
```

---

## Q4: build:mac 失败 "code signing identity"

**A**: 没有 Apple Developer ID 时,需要关闭签名。

修改 `electron-builder.json5`:
```json5
"mac": {
  "identity": null,           // 禁用签名
  "hardenedRuntime": false,  // 禁用硬化运行时
  ...
}
```

---

## Q5: Windows 提示 "无法验证发布者"

**A**: 没买 EV 代码签名证书时,Windows 会拦截。

**解决**:
1. 点击 "更多信息" → "仍要运行"
2. 或购买 DigiCert / Sectigo 代码签名证书 ($200-400/年)

---

## Q6: AI 功能没反应 / 报 "OpenAI API key 未配置"

**A**: 还没填 API key。

**步骤**:
1. 打开 app → Settings → AI → Configure
2. 填入 OpenAI API key (https://platform.openai.com/api-keys)
3. 选择模型 (推荐 gpt-4o-mini)
4. 保存

或用 .env 文件:
```bash
cp .env.example .env
echo "OPENAI_API_KEY=sk-..." > .env
```

---

## Q7: 双语字幕不显示中文

**A**: 没设置目标语言。

**步骤**:
1. Settings → AI → Bilingual Captions
2. 选目标语言 (默认 zh-CN)
3. 重新生成

---

## Q8: AI 生成内容是英文 / 中文不对

**A**: Whisper / GPT 自动检测语言。需要明确指定:

```typescript
// openai-client.ts 调用时:
transcribeWithWhisper({
  audioFile,
  language: 'zh',         // 强制中文
  hotwordDomain: 'legal'  // 法律领域
})
```

---

## Q9: Lemon Squeezy license 激活失败

**A**: 多种原因。

**排查**:
1. license key 格式: `kliq-pro-{8 位 hex}`,例如 `kliq-pro-a1b2c3d4`
2. 网络可达 `https://api.lemonsqueezy.com`
3. Cloudflare Function 环境变量配置正确:
   - `LEMON_SQUEEZY_API_KEY`
   - `LEMON_SQUEEZY_STORE`
   - `LEMON_SQUEEZY_PRODUCT_ID`

**调试**: 在 Cloudflare Pages → Logs → Live logs 看请求日志。

---

## Q10: Cloudflare Pages 部署失败 "Module not found"

**A**: `cloudflare/api/license-validate.ts` 用了 TypeScript 语法,Cloudflare 需要 esbuild。

**解决**: 在项目根目录加 `_routes.json`:
```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

Cloudflare Pages 默认支持 TypeScript Function,无需 esbuild 配置。

---

## Q11: 30 天后无任何销售怎么办?

**A**: 三选一:

1. **继续运营 90 天**: SEO 长尾,可能第二个月开始有销售
2. **调整价格**: $29 → $19 试用,看转化率
3. **关掉**: 把代码归档,域名保留 (避免域名过期被抢)

§252 验收标准是 30 天,但实战可能 60-90 天见效。

---

## Q12: 联系 @webadderall 是否能拿到更多支持?

**A**: **不能也不需要**。我们 fork 自 AGPL 项目,不需要原作者许可:
- AGPL 明确允许 fork 与修改
- 不需要通知原作者
- 不需要付费
- 我们的代码也是 AGPL (传染性)

§250 决策:**不联系**,1 人谈不下来。

---

## Q13: Kliq AI 和这个项目有什么区别?

**A**: **没有任何关系**。

- Kliq AI (离线会记) 是 **本地 LLM / 本地 ASR** 的桌面 app
- Kliq Recorder (本项目) 是 **线上大模型 API** 的屏幕录制器
- **代码不共享、域名共享**(都叫 yanjingai.tech)
- 产品形态、技术栈、目标用户完全不同

§250 / §251 / §252 决策:沿用域名不复用代码。

---

## Q14: 我不是开发者,能跑起来吗?

**A**: 大部分步骤可以,但需要基础命令行能力。

**替代方案**:
- 直接下载 GitHub Releases 的 .dmg/.exe (无需命令行)
- macOS 用户: 双击 .dmg → 拖入 Applications

如果 GitHub Actions 自动构建失败,可能需要懂开发者介入。

---

## Q15: 这个项目合规吗? 会有法律风险吗?

**A**: 完全合规。

**AGPL 3.0 风险**: 0
- 我们代码也 AGPL,合法
- 不需要联系原作者,AGPL 允许自由 fork

**OpenAI API 风险**: 0
- 我们只是用户 OpenAI 的 API,用户自己付费
- OpenAI Terms of Service 允许第三方调用 API

**Lemon Squeezy 风险**: 0
- 支付给第三方,我们只是中间人
- 销售的是软件许可,不是 SaaS 服务

**中国大陆 ICP 备案**: 0
- 我们只部署 Cloudflare Pages 全球节点
- 用户通过 Cloudflare CDN 访问,不直接连中国大陆服务器
- §250 决策: 不做 ICP 备案

**风险点**:
- Apple / Microsoft / Linux 平台审核 (NSIS / .dmg / AppImage) — 用户自签名可绕过
- 内容审核 — 我们只做录制 + AI 字幕,不做内容分发

---

## Q16: AGPL 真的传染,我不想要开源怎么办?

**A**: 想多了。AGPL 不是问题。

**事实**:
- 大型 SaaS 公司 (MongoDB, Grafana, Nextcloud) 都用 AGPL
- 你不是 SaaS,是桌面 app (用户下载到本机)
- 桌面 app 的 AGPL 风险几乎为 0 (用户都已经在"网络使用"了)

**真正传染场景**:
- 你开发一个 web 服务,用 AGPL 代码作后端,用户通过网络访问 → 必须开源
- 你分发一个本地 app → 没有传染问题

**结论**: AGPL 对你 = 完全免费 + 完全自由。

---

## Q17: 还想加 X 功能 (剪辑/特效/直播) 怎么办?

**A**: §252 已经规划了 36 个微变化。

**优先级**:
- P0: 双语字幕 ✅,智能章节 ✅,摘要 ✅
- P1: 行业热词 ✅,中文 UI ✅,极简风 ✅
- P2: 智能剪辑 (去静音/加速),多平台发布 (抖音/B站),场景模板
- P3: 云端协作 (R2 + D1)

每个微变化都是独立 commit, 用户拍板做哪个我就做哪个。

---

## Q18: 怎么贡献代码?

**A**: 因为 AGPL,任何人都可以 fork + 改 + 自己用。

**注意**:
- 改完必须也以 AGPL 发布 (传染)
- 不需要 PR 回我们
- 不需要通知原作者

我们不维护 PR 审核流程 (§250 决策:1 人 SOLO 没精力)。

---

## Q19: 这个项目会更新维护吗?

**A**: 视情况。

- **30 天验收通过** → 持续迭代 + 加 Pro tier
- **30 天验收失败** → 标记失败,只修严重 bug
- **Kliq AI (离线会记) 重启** → 抽调精力,Recordly 维护可能降级

§250 / §251 / §252 已经定了验收标准。

---

## Q20: 找不到答案怎么办?

**A**: 三个渠道:

1. **查看文档**:
   - `README.md` - 项目介绍
   - `INSTALL.md` - 安装构建
   - `CLOUD.md` - Cloudflare 部署
   - `ATTRIBUTION.md` - AGPL 合规
   - `CHANGELOG.md` - 变更记录

2. **GitHub Issues**: https://github.com/yanjingai/recorder/issues

3. **邮件**: hi@yanjingai.tech

---

**更多问题随时加 FAQ。**
