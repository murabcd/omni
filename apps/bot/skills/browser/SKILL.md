---
name: browser
description: Browser automation via agent-browser tools.
---
# browser

Browser automation tools (agent-browser).

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/browser/<name>/skill.json`.
- The `tool` field supports `browser.<tool_name>`.

Available tools
- `browser_open`
- `browser_snapshot`
- `browser_click`
- `browser_fill`
- `browser_type`
- `browser_press`
- `browser_frame`
- `browser_get`
- `browser_wait`
- `browser_screenshot`
- `browser_close`
