---
name: yandex-wiki
description: Wiki tools map + usage notes for Yandex Wiki.
---

# yandex-wiki

This skill documents the Yandex Wiki tools exposed by the bot and how to use them via runtime skills.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/<name>/skill.json`.
- The `tool` field supports `yandex-wiki.<tool_name>`.

Available Wiki tools

Pages
- `wiki_page_get`
- `wiki_page_get_by_id`
- `wiki_page_create`
- `wiki_page_update`
- `wiki_page_append_content`
