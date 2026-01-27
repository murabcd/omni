---
name: memory
description: Supermemory tools map + usage notes for memory tools.
---
# memory

Supermemory tools exposed by the bot.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/memory/<name>/skill.json`.
- The `tool` field supports `memory.<tool_name>`.

Available tools
- `searchMemories`
- `addMemory`
