---
summary: "UI preview generation with json-render"
read_when:
  - Wanting to generate UI previews from chat
---
# UI preview

Omni can generate a json-render UI tree and publish a preview link.

## Tool

- `ui_publish` — stores a UI JSON tree in R2 and returns a preview URL.

The tool also attempts to capture a screenshot with agent-browser when enabled.

## Inputs

```
{
  "title": "Dashboard",
  "notes": "High-level mockup",
  "tree": { "root": "...", "elements": { ... } },
  "patches": "JSONL patch lines (optional; if provided, tree is optional)",
  "data": { "ui": { "title": "Dashboard" } }
}
```

## Environment

```
UI_SCREENSHOT_ENABLED=1
UI_PREVIEW_BASE_URL=https://admin.example.com
UI_URL_TTL_MS=3600000
```

`UI_SIGNING_SECRET` must be set as a Worker secret (or reuse `IMAGE_SIGNING_SECRET`) to enable signed preview links.

If you want screenshots, ensure `BROWSER_ALLOWLIST` includes the preview domain
(`UI_PREVIEW_BASE_URL`).
