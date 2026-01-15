# crawl4ai Page Exporter

[![CI](https://github.com/flitzrrr/page-export-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/flitzrrr/page-export-extension/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Chrome/Edge Manifest v3 extension plus a FastAPI backend that captures HTML from your logged-in browser session and converts it to Markdown with crawl4ai.

## Features

- Export the current page HTML, or the current page plus internal links.
- Works behind authentication (SSO, 2FA) because it runs in your browser session.
- Backend converts HTML to Markdown using crawl4ai.
- Localized extension UI (English/German).

## Repository structure

- `extension/` – Chrome/Edge Manifest v3 extension (TypeScript source in `extension/src`).
- `backend/` – FastAPI service using crawl4ai (single-file backend + tests).
- `scripts/` – build/packaging helpers.

## Browser extension (Chrome / Edge)

### Build

```bash
npm install
npm run build
```

This compiles TypeScript into `extension/dist`. Load the unpacked extension from the repo root (`extension/`).

### Install (unpacked)

1. Clone the repo and build the extension.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `extension` folder.

### Usage

1. Navigate to the page you want to capture.
2. Click the extension icon and choose:
   - **Export current page HTML**
   - **Export page + internal links**
3. Configure backend URL, target folder, and output format in the popup.

### Supported browsers

- Chrome (Manifest v3)
- Edge (Manifest v3)

## Backend (FastAPI + crawl4ai)

### Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
crawl4ai-setup
```

### Run

```bash
EXPORT_BASE_DIR="/path/to/export-dir" \
  uvicorn main:app --host 0.0.0.0 --port 8000
```

### API

- `POST /api/import-html`
  - Body: `{ html, url, title, output_format, target_folder, relative_path }`
  - Stores `slug.html` and (optionally) `slug.md` under `EXPORT_BASE_DIR`.
- `GET /health`

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run test
```

### Scripts

- `npm run dev` – watch TypeScript type checks.
- `npm run build` – compile extension to `extension/dist`.
- `npm run lint` – run ESLint.
- `npm run format` – format with Prettier.
- `npm run typecheck` – strict TypeScript checks.
- `npm run test` – run backend tests (pytest).
- `npm run test:extension` – run the popup smoke test.
- `npm run package` – build and zip the extension into `dist/`.

## Security and threat model

This extension can read any page you visit and sends HTML to a backend you configure. Treat the backend as sensitive infrastructure:

- Only send data to a backend you control and trust.
- Use HTTPS in production and keep access scoped to trusted networks.
- Do not run the extension in profiles with unrelated sensitive data.
- Consider tightening backend CORS and authentication before exposing it.

## Release

See `RELEASE.md` for versioning and release steps. The zip artifact is created in `dist/` and can be uploaded to the Chrome Web Store or distributed internally.

## Contributing

See `CONTRIBUTING.md` for local setup, coding standards, and PR guidelines.
