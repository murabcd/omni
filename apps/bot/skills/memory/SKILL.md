---
name: memory
description: Workspace memory tools map + usage notes.
---
# memory

Workspace memory tools exposed by the bot.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/memory/<name>/skill.json`.
- The `tool` field supports `memory.<tool_name>`.

Available tools
- `memory_read`
- `memory_append`
- `memory_write`
- `memory_search`
