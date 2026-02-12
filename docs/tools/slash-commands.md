---
summary: "Telegram slash commands supported by Omni"
read_when:
  - Looking for supported commands
---
# Slash commands

Supported commands:

- `/start` — intro
- `/help` — usage
- `/tool list` — list available tools, conflicts, and policy-suppressed tools
- `/status` — Yandex Tracker health check + uptime
- `/new <name>` — create a new chat context (DM only, default is `untitled chat`)
- `/resume` — switch back to previous chat (DM only)
- `/resume list` — list chat contexts (DM only)
- `/task` — background task (/task <request>, /task status <id>, /task cancel <id>)
- `/research` — guided research mode (collect inputs, then run)
- `/model` — show current model and fallbacks
- `/model list` — list available models
- `/model set <ref>` — switch model for this session
- `/model reasoning <level>` — set reasoning level (off|low|standard|high)
- `/skill list` — list runtime skills
- `/skill <name> <json>` — run a runtime skill
- `/yandex-tracker <tool> <json>` — call a Yandex Tracker tool directly