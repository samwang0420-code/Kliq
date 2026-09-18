# 言镜 — Cloudflare Pages 部署指南

## 概述

`./cloudflare/` 目录包含两个产物:
1. **`pages/`** - 静态营销页 (yanjingai.tech 主页)
2. **`api/`** - Cloudflare Pages Functions (许可证校验 API)

## 部署步骤

### 1. 准备

```bash
# 安装 wrangler
npm install -g wrangler

# 登录
wrangler login
```

### 2. 创建项目

```bash
wrangler pages project create yanjingai-tech
```

### 3. 配置环境变量

在 Cloudflare Dashboard → Pages → yanjingai-tech → Settings → Environment variables:

| Variable | Value | Environment |
|---|---|---|
| `LEMON_SQUEEZY_API_KEY` | `your-ls-api-key` | Production |
| `LEMON_SQUEEZY_STORE` | `your-store-id` | Production |
| `LEMON_SQUEEZY_PRODUCT_ID` | `your-product-id` | Production |

### 4. 部署

#### 部署静态页 (无 API)

```bash
cd cloudflare/pages
wrangler pages deploy . --project-name yanjingai-tech
```

#### 部署完整应用 (含 API Function)

合并 `cloudflare/pages/` 和 `cloudflare/api/` 为一个目录:

```bash
mkdir -p deploy-tmp
cp -r cloudflare/pages/* deploy-tmp/
mkdir -p deploy-tmp/api
cp cloudflare/api/license-validate.ts deploy-tmp/api/

cd deploy-tmp
wrangler pages deploy . --project-name yanjingai-tech
```

部署后访问: `https://yanjingai.tech`

### 5. 绑定自定义域名

1. Cloudflare Dashboard → Pages → yanjingai-tech → Custom domains
2. 添加 `yanjingai.tech`
3. Cloudflare 自动配置 DNS (用户域名的 NS 必须指向 Cloudflare)

---

## 域名配置

### DNS 记录 (yanjingai.tech)

```
类型   名称    内容                          TTL
A      @       192.0.2.1 (Cloudflare proxy) Auto
CNAME  www     yanjingai-tech.pages.dev    Auto
```

### SSL/TLS

- Cloudflare 自动签发 + 续期 Let's Encrypt 证书
- 强制 HTTPS (Settings → SSL/TLS → Full)

---

## Lemon Squeezy 集成

### 创建产品

1. https://lemonsqueezy.com → New Store
2. Products → New Product:
   - Name: Yanjing Recorder Pro
   - Price: $29
   - License Key: Enable
3. 保存 → 复制 Product ID

### Webhook (可选)

设置 webhook URL 接收订单事件:
- `https://yanjingai.tech/api/lemonsqueezy-webhook`

Stage 6 阶段未实施 webhook, 仅 API validate。

---

## 监控

### 访问日志

Cloudflare Dashboard → Pages → yanjingai-tech → Logs → Live logs

### 分析 (可选)

集成 Cloudflare Web Analytics (免费, 零侵入):

```html
<!-- 在 cloudflare/pages/index.html <head> 内添加 -->
<script defer src='https://static.cloudflareinsights.com/beacon.min.js'
  data-cf-beacon='{"token": "your-token"}'></script>
```

---

## 费用估算

| 服务 | 免费额度 | 我们的预期 |
|---|---|---|
| Cloudflare Pages | 无限请求 + 500 builds/月 | 实际 < 100 builds/月 |
| Cloudflare Functions | 100,000 请求/日 | 实际 < 100 请求/日 |
| DNS | 无限 | 5 条记录 |
| SSL | 无限 | 1 域名 |

**总成本**: $0/月

---

## 关联文档

- [INSTALL.md](./INSTALL.md) - 本地构建
- [README.md](./README.md) - 项目介绍
- [ATTRIBUTION.md](./ATTRIBUTION.md) - AGPL 合规
- [outputs/05-Stage1-项目骨架+品牌改名+AGPL-2026-09-18.md](./outputs/05-Stage1-项目骨架+品牌改名+AGPL-2026-09-18.md) - Stage 1 报告
