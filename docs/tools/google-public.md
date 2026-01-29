---
summary: "Public Google Docs/Sheets/Slides tools"
read_when:
  - Reading publicly shared Google Docs or Sheets without OAuth
---
# Public Google Docs/Sheets/Slides tools

Omni can read publicly shared Google Docs/Sheets/Slides using export URLs (no OAuth).

## Tools

- `google_public_doc_read` — read a public Google Doc by shared link.
- `google_public_sheet_read` — read a public Google Sheet by shared link.
- `google_public_slides_read` — read a public Google Slides deck by shared link.

## Notes

- The document must be shared as "Anyone with the link" (viewer or editor).
- For Sheets, specify `gid` if you need a non-default tab.
