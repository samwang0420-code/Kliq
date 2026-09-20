# Kliq — Cloudflare Pages 部署指南

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

**从仓库根执行一条命令**（`wrangler.toml` 已声明 `pages_build_output_dir = "cloudflare/pages"`，
Pages 会自动发现根目录的 `functions/`）：

```bash
npx wrangler pages deploy --project-name yanjingai-tech
```

> 历史坑：早期文档让人 `cd cloudflare/pages` 再部署，看似成功，但 Pages **只会发现部署目录同级的
> `functions/`** —— 于是 `functions/api/license-validate.ts` 从未被上传，
> `/api/license-validate` 一直 404，客户端只能退化成离线激活。不要再用子目录部署。
> 早期还有一份「把 pages 和 api 拷进 deploy-tmp 合并」的写法，同样已废弃。

> 只想要静态页、不要 API 时：`npx wrangler pages deploy cloudflare/pages --project-name yanjingai-tech`

### 5. 绑定自定义域名（当前**尚未完成**）

```bash
npx wrangler pages project domain add yanjingai-tech yanjingai.tech
```

现状（2026-09-20 实测）：
- `https://yanjingai-tech.pages.dev` 在线，HTTP 200
- `https://yanjingai.tech` **不解析** —— 域名 NS 已在 Cloudflare（wilson/kristin.ns.cloudflare.com），
  但没有 A / CNAME 记录指向 Pages，自定义域名未绑定

在没有绑定域名之前，`VITE_KLQ_SITE_URL` 指向 `https://yanjingai.tech` 会让
`/api/license-validate` 直接连接失败（客户端会自动回退离线激活，不会卡住用户），
但个人中心会显示「已连接」—— 这是 `isLicenseServiceConfigured()` 只看变量有没有配导致的，
绑定域名 + 部署 Functions 后才是真的连上。

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
   - Name: Kliq Pro（一次性买断 / License Key）
   - Price: $9.9
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
