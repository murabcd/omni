---
summary: "Telegram webhook setup for Cloudflare Workers"
read_when:
  - Deploying the bot to Cloudflare Workers
---
# Webhook

Omni exposes a single Telegram webhook endpoint at `/telegram` via
Cloudflare Workers.

## Steps

1) Deploy the Worker:
```
npx wrangler deploy --config worker/wrangler.toml
```

2) Set the Telegram webhook:
```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<worker>.workers.dev/telegram
```

3) Verify:
```
https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

If Telegram cannot reach the URL, it will return a 4xx error when you call
`setWebhook`.
