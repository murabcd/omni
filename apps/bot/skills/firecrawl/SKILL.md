---
name: firecrawl
description: Firecrawl web research tools (search, scrape, crawl, extract).
---
# firecrawl

Firecrawl tools for web research and crawling.

Runtime skills
- Each tool can be wrapped as a runtime skill in `apps/bot/skills/firecrawl/<name>/skill.json`.
- The `tool` field supports `firecrawl.<tool_name>`.

Available tools
- `firecrawl_search`
- `firecrawl_scrape`
- `firecrawl_map`
- `firecrawl_crawl` (async)
- `firecrawl_batch_scrape` (async)
- `firecrawl_extract` (async)
- `firecrawl_poll`
- `firecrawl_status`
- `firecrawl_cancel`
