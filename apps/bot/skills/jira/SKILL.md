---
name: jira
description: Jira tools map + usage notes for Jira tools.
---
# jira

Jira assistant tools exposed by the bot.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/jira/<name>/skill.json`.
- The `tool` field supports `jira.<tool_name>`.

Available tools
- `jira_search`
- `jira_sprint_issues`
- `jira_issues_find`
- `jira_issue_get`
- `jira_issue_get_comments`
