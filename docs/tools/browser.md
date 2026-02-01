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
BROWSER_ALLOWLIST=https://flomni.com,*.flomni.com
```

- If `BROWSER_ALLOWLIST` is empty, any http/https URL is allowed.
- Use allowlist in production.
- Allowlist supports exact origins (e.g., `https://flomni.com`) and wildcard subdomains (e.g., `*.flomni.com`).

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
- `browser_screenshot` — capture a screenshot and send it to Telegram (and admin chat when image storage is configured)
- `browser_close` — close the session

## Notes

- Screenshots are sent directly to Telegram. If image storage is configured, the admin chat UI also renders the screenshot via signed `/media/...` URLs.
- `agent-browser` must be installed on the host where the bot runs.
