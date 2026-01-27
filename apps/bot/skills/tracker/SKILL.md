---
name: tracker
description: Tracker tools map + usage notes for Tracker tools.
---
# tracker

Tracker assistant tools exposed by the bot.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/tracker/<name>/skill.json`.
- The `tool` field supports `tracker.<tool_name>`.

Available tools
- `tracker_search`
