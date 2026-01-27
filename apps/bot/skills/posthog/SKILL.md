---
name: posthog
description: PostHog tools map + usage notes for PostHog tools.
---
# posthog

PostHog read-only tools exposed by the bot.

Quick start
- Telegram: `/skill <name> <json>`

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/posthog/<name>/skill.json`.
- The `tool` field supports `posthog.<tool_name>`.

Available tools
- `actions-get-all`
- `action-get`
- `dashboards-get-all`
- `dashboard-get`
- `docs-search`
- `error-details`
- `list-errors`
- `event-definitions-list`
- `properties-list`
- `experiment-get`
- `experiment-get-all`
- `experiment-results-get`
- `feature-flag-get-all`
- `feature-flag-get-definition`
- `insight-get`
- `insight-query`
- `insights-get-all`
- `query-generate-hogql-from-question`
- `query-run`
- `get-llm-total-costs-for-project`
- `logs-list-attribute-values`
- `logs-list-attributes`
- `logs-query`
- `organization-details-get`
- `organizations-get`
- `projects-get`
- `property-definitions`
- `entity-search`
- `survey-get`
- `survey-stats`
- `surveys-get-all`
- `surveys-global-stats`
