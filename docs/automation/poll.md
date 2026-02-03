---
summary: "Local long-polling mode for development"
read_when:
  - Running the bot locally
---
# Long‑polling (local dev)

Local development uses Telegram long‑polling via grammY.

```
bun dev
```

Notes:
- This does not use the webhook.
- Use the same `BOT_TOKEN` as production.

Production note:
- Disable the Telegram webhook before running long‑polling:
  `https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook`
