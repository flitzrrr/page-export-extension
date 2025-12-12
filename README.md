# crawl4ai Page Exporter

Browser extension to export the current page (optionally with internal links) as HTML files that you can feed into **crawl4ai** for Markdown conversion and RAG pipelines.

The UI texts are localized (English/German) based on your browser language, but this documentation is English only.

---

## Overview

**crawl4ai Page Exporter** is a small Chrome/Edge extension that:

- exports the **current page** to a `.html` file, or
- exports the **current page + internal links** as multiple `.html` files.

It runs inside your logged-in browser session, so you can capture content behind authentication (SSO, 2FA, internal docs) and then feed these HTML files into **crawl4ai** to get clean, LLM-ready Markdown.

### Features

- Manifest v3 (Chrome / Edge)
- Works on all domains (`<all_urls>`), including behind login
- Two modes:
  - “Export current page HTML”
  - “Export page + internal links”
- Options:
  - Only same-origin links
  - Max number of pages (including the starting page)
- UI automatically switches between English and German based on your browser language

---

## Installation (Chrome / Edge)

1. Clone the repo:

   ```bash
   git clone git@github.com:flitzrrr/page-export-extension.git
   cd page-export-extension
   ```

2. In Chrome/Edge:

   - Open `chrome://extensions` or `edge://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `page-export-extension` folder

3. You should see an icon (puzzle piece or similar) with tooltip **“crawl4ai Page Exporter”**.

---

## Usage

1. Navigate to the page you want to capture (e.g. internal technical docs).
2. Make sure you are logged in in your browser (if required).
3. Click the extension icon and then in the popup:

   - **“Export current page HTML”**  
     → saves only the current page as a single `.html` file.

   - **“Export page + internal links”**  
     → collects internal links, opens each in a background tab, saves the HTML files, and closes the tabs again.

4. In the popup you can configure:

   - “Only same-origin links” (recommended to stay within the site)
   - “Max. pages (including this one)” e.g. `20`

> Note: Keep the popup open while the multi-export is running until you see the final status message.

---

## Integration with crawl4ai

The extension stores `.html` files that are designed to work smoothly with **crawl4ai**.

In the `crawl4ai` repo there is a helper:

- Module: `crawl4ai.script`
- Function: `html_batch_to_md_cli`

Example:

```python
from crawl4ai.script import html_batch_to_md_cli

html_dir = "/path/to/exported/html"      # folder with .html files from the extension
md_dir = "/path/to/output/markdown"      # where to write .md files

html_batch_to_md_cli(html_dir, md_dir, overwrite=False)
```

Internally, this uses `file://` URLs and the normal crawl4ai Markdown pipeline, so the resulting `.md` files are ready for RAG, QA, or any other LLM-based workflow.

---

## Development

- Manifest v3, no build step required (plain JS/HTML/CSS).
- To change text/labels, edit:
  - `_locales/en/messages.json`
  - `_locales/de/messages.json`
- To adjust crawl behavior (e.g. link selection), edit:
  - `content.js` – link extraction / page HTML extraction
  - `popup.js` – UI logic, batching, and download handling
