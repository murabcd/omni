---
name: google-public
description: Public Google Docs/Sheets tools (no OAuth).
---

# google-public

Tools for reading publicly shared Google Docs/Sheets by link.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/<name>/skill.json`.
- The `tool` field supports `google-public.<tool_name>`.

Available tools

Docs
- `google_public_doc_read`

Sheets
- `google_public_sheet_read`
