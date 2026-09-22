# kliq-waffo-worker

Cloudflare Worker for the Kliq (K) **Waffo** payment bridge.

## What this does

The Electron app can't call Waffo's Node-crypto HMAC signing directly (Electron main
process can, but the renderer cannot, and we want the public checkout API surface
on a thin bridge so we don't ship the private key in the bundle). This Worker:

1. Receives `POST /api/waffo/checkout` from the renderer (or the Electron main).
2. Calls the **Waffo Pancake SDK** to create a checkout session.
3. Returns the session's `checkoutUrl` so the renderer can `window.open` it.
4. Receives `POST /api/waffo/webhook` from Waffo, verifies the HMAC, and forwards
   to the Electron app's fulfillment endpoint.

## Why a separate Worker (and not Next.js / CF Pages)

`@waffo/pancake-ts` depends on Node `crypto.createSign` / `createPrivateKey` /
`createHash` (OpenSSL bindings). CF Pages V8 isolate + webpack polyfill looks
like it builds locally but fails in production because the polyfill can't
replicate OpenSSL. A standalone Worker with the `nodejs_compat` flag can run
the SDK unchanged.

This is documented in AGENTS.md §GSPR-1.

## Modes

- **`WAFFO_MOCK_MODE = "true"`** — no SDK, no real Waffo calls. Returns fake
  checkout URLs of the form `https://waffo.example/checkout/sess_<uuid>` so the
  Electron app can develop the full purchase flow end-to-end without real
  credentials. This is the default for `wrangler dev --local`.
- **`WAFFO_MOCK_MODE = "false"`** — instantiates `WaffoPancake` with
  `WAFFO_PRIVATE_KEY` and creates a real checkout session.

## Routes

| Method | Path                       | Purpose                                   |
|-------:|----------------------------|-------------------------------------------|
| POST   | `/api/waffo/checkout`      | Create checkout session, return URL       |
| POST   | `/api/waffo/webhook`       | Verify Waffo webhook, forward to fulfillment |
| GET    | `/api/health`              | Liveness probe (mock echo)                |

## Bridge auth

The Electron app (renderer or main) sends a header
`X-KLQ-Bridge-Secret: <KLQ_CHECKOUT_SHARED_SECRET>`. The Worker verifies this
with constant-time comparison so callers can't probe the secret one byte at a
time. In mock mode the secret is optional; in production it is required.

## Local dev

```bash
cd workers/waffo
npm install
npm run dev   # wrangler dev --local
```

`wrangler dev --local` uses the same workerd engine as production, so any
`crypto.createSign` / `createPrivateKey` paths you exercise here will behave
identically once deployed.

## Deploy

```bash
cd workers/waffo
wrangler secret put WAFFO_PRIVATE_KEY          # paste from Waffo dashboard
wrangler secret put KLQ_CHECKOUT_SHARED_SECRET # openssl rand -base64 32
wrangler deploy
```

Then point `VITE_KLQ_CHECKOUT_URL` at the deployed Worker URL.

## Out of scope

- Fulfillment business logic (activate Pro / grant credits / send email) —
  handled by the Electron app's local license service. The Worker forwards
  verified webhooks only.
- ICP filing / License / Stripe / Paddle — see AGENTS.md §250 (no alternative
  payment rails in v1).
