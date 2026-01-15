# Contributing

Thanks for contributing! This project includes a browser extension and a FastAPI backend.

## Prerequisites

- Node.js 18+
- Python 3.10+
- Chrome or Edge for extension testing

## Local setup

```bash
git clone git@github.com:flitzrrr/page-export-extension.git
cd page-export-extension
npm install

cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
crawl4ai-setup
```

## Development workflow

- Build the extension:
  ```bash
  npm run build
  ```
- Load the `extension/` folder in `chrome://extensions`.
- Run the backend:
  ```bash
  EXPORT_BASE_DIR="/path/to/export-dir" uvicorn main:app --reload
  ```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
```

## Pull requests

- Use Conventional Commits (for example: `feat: add export filter`).
- Keep changes focused and include tests when behavior changes.
- Update documentation for user-facing changes.

## Release artifacts

```bash
npm run package
```

This writes a zip file into `dist/`.
