---
summary: "Jira tool integration"
read_when:
  - Setting up Jira tools
  - Debugging Jira tool calls
---
# Jira tools

Omni can query Jira using API token authentication (email + API token).

## Environment variables

Set these in your runtime environment or Cloudflare dashboard:

- `JIRA_BASE_URL` — e.g. `https://flomni.atlassian.net`
- `JIRA_EMAIL` — account email
- `JIRA_API_TOKEN` — API token (secret)
- `JIRA_PROJECT_KEY` — default project key (e.g. `FL`)
- `JIRA_BOARD_ID` — default board id for sprint lookups (required for `jira_sprint_issues`)

If any of these are missing, Jira tools are not registered.

## Tools

- `jira_search` — search Jira issues using keywords. Returns keys, summaries, descriptions, and comments.
- `jira_issues_find` — search issues using raw JQL.
- `jira_issue_get` — get issue summary/description by key.
- `jira_issue_get_comments` — fetch comments by key.
- `jira_sprint_issues` — list issues for a sprint by name or id (uses `JIRA_BOARD_ID` when sprint name is provided).

## Notes

- Comments and descriptions are flattened from Atlassian Document Format (ADF) into plain text.
- Group chats still block web search and Supermemory tools, but Jira tools remain available.
