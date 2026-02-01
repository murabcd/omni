---
summary: "Browser automation via agent-browser"
read_when:
  - Adding website checks or screenshots
---
# Browser tools

Omni can drive a headless browser through the `agent-browser` CLI. These tools are
exposed to the agent loop (no slash command).

## Enable

Set in `apps/bot/.env`:

```
BROWSER_ENABLED=1
BROWSER_ALLOWLIST=https://flomni.com,https://www.flomni.com
```

- If `BROWSER_ALLOWLIST` is empty, any http/https URL is allowed.
- Use allowlist in production.

## Available tools

- `browser_open` — open a URL
- `browser_snapshot` — accessibility tree snapshot
- `browser_click` — click an element (selector or ref)
- `browser_fill` — fill an input
- `browser_type` — type into an element
- `browser_press` — press a key
- `browser_frame` — switch iframe
- `browser_get` — read page or element data
- `browser_wait` — wait for selector or timeout
- `browser_screenshot` — capture a screenshot and send it to Telegram
- `browser_close` — close the session

## Notes

- The bot sends screenshots directly to Telegram and does not store them.
- `agent-browser` must be installed on the host where the bot runs.
