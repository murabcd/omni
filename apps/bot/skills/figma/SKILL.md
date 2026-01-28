---
name: figma
description: Figma tools map + usage notes for Figma read-only tools.
---

# figma

This skill documents the Figma tools exposed by the bot and how to use them via runtime skills.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/<name>/skill.json`.
- The `tool` field supports `figma.<tool_name>`.

Available Figma tools

User
- `figma_me`

Files
- `figma_file_get`
- `figma_file_nodes_get`
- `figma_file_comments_list`
- `figma_project_files_list`
