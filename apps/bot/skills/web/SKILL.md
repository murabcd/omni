---
name: web
description: Web tools map + usage notes for web search tools.
---
# web

Web search tools exposed by the bot.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/web/<name>/skill.json`.
- The `tool` field supports `web.<tool_name>`.

Available tools
- `web_search`
