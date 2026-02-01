---
summary: "Firecrawl tools for web research"
read_when:
  - Adding Firecrawl-based research tools
  - Debugging crawl/scrape behavior
---
# Firecrawl tools

Firecrawl is used for web research and crawling. Tools are registered when
`FIRECRAWL_API_KEY` is set.

## Tools

- `firecrawl_search` — search the web (Firecrawl search)
- `firecrawl_scrape` — scrape a single URL
- `firecrawl_map` — discover URLs on a site
- `firecrawl_crawl` — crawl multiple pages (async)
- `firecrawl_batch_scrape` — scrape multiple URLs (async)
- `firecrawl_extract` — extract structured data (async)
- `firecrawl_poll` — poll async jobs
- `firecrawl_status` — check job status
- `firecrawl_cancel` — cancel a job
- `research_export_csv` — send a CSV file to the user

## Notes

- Async tools (`crawl`, `batch_scrape`, `extract`) should be paired with
  `firecrawl_poll` to wait for completion.
- Use `research_export_csv` when the output is best as a table for download.
