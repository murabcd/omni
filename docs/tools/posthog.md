---
summary: "PostHog tool integration"
read_when:
  - Setting up PostHog tools
  - Querying PostHog insights
---
# PostHog tools

Omni can query PostHog using the PostHog Agent Toolkit (AI SDK integration). We register **read-only** tools only (no create/update/delete).

## Environment variables

Set these in your runtime environment or Cloudflare dashboard:

- `POSTHOG_PERSONAL_API_KEY` — Personal API key (secret)
- `POSTHOG_API_BASE_URL` — API base URL (EU: `https://eu.posthog.com`)

If the API key is missing, PostHog tools are not registered.

## Available tools

Omni exposes PostHog read-only tools (examples):

- `insights-get-all`, `insight-get`, `insight-query`
- `query-run`, `query-generate-hogql-from-question`
- `dashboards-get-all`, `dashboard-get`
- `feature-flag-get-all`, `feature-flag-get-definition`
- `experiments-get-all`, `experiment-get`, `experiment-results-get`
- `logs-query`, `list-errors`, `error-details`
- `organizations-get`, `organization-details-get`, `projects-get`
- `entity-search`, `docs-search`

Write/delete tools (create/update/delete) are not registered.

## Notes

- Tool availability follows chat policy: in groups, web search and memory tools are blocked, but PostHog tools remain available.
