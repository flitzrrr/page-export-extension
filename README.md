# crawl4ai Page Exporter

All-in-one repo containing:

- a **Chrome/Edge extension** to export the current page (optionally with internal links) and send it to a backend, and
- a **FastAPI backend** that uses **crawl4ai** to turn those HTML pages into Markdown.

The UI texts are localized (English/German) based on your browser language, but this documentation is English only.

---

## Repository structure

- `extension/` – Chrome/Edge Manifest v3 extension  
  - `manifest.json`, `popup.html`, `popup.js`, `content.js`, `_locales/*`
- `backend/` – FastAPI service using crawl4ai  
  - `main.py` (single-file backend)

You can use them together or independently.

---

## Extension (Chrome / Edge)

### Overview

**crawl4ai Page Exporter** (under `extension/`) is a small Chrome/Edge extension that:

- exports the **current page** (HTML), or
- exports the **current page + internal links** (multi-page),
- and sends each page to a backend that can store/convert it.

It runs inside your logged-in browser session, so you can capture content behind authentication (SSO, 2FA, internal docs) and then process it with **crawl4ai** on the backend.

### Features

- Manifest v3 (Chrome / Edge)
- Works on all domains (`<all_urls>`), including behind login
- Two export modes:
  - “Export current page HTML”
  - “Export page + internal links”
- Options in the popup:
  - Only same-origin links
  - Max number of pages (including the starting page)
- Backend settings in the popup:
  - Backend URL (e.g. `http://localhost:8000`)
  - Target folder (server-side)
  - Output format (`markdown` or `html`)
- UI automatically switches between English and German based on browser language

### Install extension (unpacked)

1. Clone the repo:

   ```bash
   git clone git@github.com:flitzrrr/page-export-extension.git
   cd page-export-extension
   ```

2. In Chrome/Edge:

   - Open `chrome://extensions` or `edge://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `extension` folder inside this repo

3. You should see an icon (puzzle piece or similar) with tooltip **“crawl4ai Page Exporter”**.

### Usage

1. Navigate to the page you want to capture (e.g. internal technical docs).
2. Make sure you are logged in in your browser (if required).
3. Click the extension icon and then in the popup:

   - **“Export current page HTML”**  
     → sends only the current page to the backend.

   - **“Export page + internal links”**  
     → collects internal links, opens each in a background tab, sends the HTML to the backend, and closes the tabs again.

4. In the popup configure:

   - “Only same-origin links” (recommended to stay within the site)
   - “Max. pages (including this one)” e.g. `20`
   - **Backend settings**:
     - Backend URL: e.g. `http://localhost:8000`
     - Target folder: e.g. `docs/baikal-tech`
     - Output format: `Markdown` or `HTML only`

> Note: Keep the popup open while the multi-export is running until you see the final status message.

---

## Backend (FastAPI + crawl4ai)

The backend lives in `backend/main.py` and exposes a single endpoint that the extension calls.

### API

- `POST /api/import-html`
  - Request body:
    - `html: str` – full HTML of the page
    - `url: str | null`
    - `title: str | null`
    - `output_format: "markdown" | "html"`
    - `target_folder: str` – server-side folder (relative to `EXPORT_BASE_DIR`)
  - Behavior:
    - Saves `slug.html` under `EXPORT_BASE_DIR/target_folder`.
    - If `output_format == "markdown"`:
      - runs crawl4ai with `file://...` on that HTML file,
      - writes `slug.md` next to it.
  - Response:
    - `{ "ok": true, "saved_html": "...", "saved_markdown": "..." }`

### Run the backend locally

1. From this repo root:

   ```bash
   cd backend

   # dependencies (example)
   pip install fastapi uvicorn "crawl4ai[playwright]"
   crawl4ai-setup
   ```

2. Start the server:

   ```bash
   EXPORT_BASE_DIR="/path/to/export-dir" \
     uvicorn main:app --host 0.0.0.0 --port 8000
   ```

3. In the extension popup:

   - Backend URL: `http://localhost:8000`
   - Target folder: e.g. `docs/baikal-tech`
   - Output format: `Markdown`

Now every exported page (and optional sub-link) will be sent to `/api/import-html`, and `.html` + `.md` files will appear under `EXPORT_BASE_DIR`.

---

## Development notes

- Extension:
  - Manifest v3, no build step required (plain JS/HTML/CSS).
  - To change text/labels, edit:
    - `extension/_locales/en/messages.json`
    - `extension/_locales/de/messages.json`
  - To adjust crawl behavior (e.g. link selection), edit:
    - `extension/content.js` – link extraction / page HTML extraction
    - `extension/popup.js` – UI logic, batching, backend calls

- Backend:
  - Single-file FastAPI app in `backend/main.py`.
  - Uses crawl4ai’s default Markdown generator; you can customize the `CrawlerRunConfig` or Markdown generator as needed.
