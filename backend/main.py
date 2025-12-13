from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import urlparse
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, DefaultMarkdownGenerator


BASE_DIR = Path(os.getenv("EXPORT_BASE_DIR", "./exports")).resolve()
BASE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="crawl4ai HTML Import Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImportRequest(BaseModel):
  html: str
  url: Optional[str] = None
  title: Optional[str] = None
  output_format: Literal["markdown", "html"] = "markdown"
  target_folder: str = ""
  # Optional relative path from the extension (e.g. /apis/access-sessions)
  relative_path: Optional[str] = None


def _safe_slug(value: str) -> str:
  value = value or "page"
  slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("_")
  return slug or "page"


def _resolve_paths(req: ImportRequest) -> tuple[Path, Path, Path]:
  """
  Compute (target_dir, html_path, md_path) based on target_folder + URL/path.

  Example:
    EXPORT_BASE_DIR=/exports
    target_folder=docs/baikal-tech
    url=https://developers.baikalplatform.com/apis/access-sessions

    -> /exports/docs/baikal-tech/apis/access-sessions.html
  """
  target_dir = BASE_DIR
  if req.target_folder:
    safe_parts = [p for p in Path(req.target_folder).parts if p not in (".", "..", "/")]
    if safe_parts:
      target_dir = BASE_DIR.joinpath(*safe_parts)

  # Prefer explicit relative_path, fall back to URL path, then simple "page"
  raw_path: Optional[str] = None
  if req.relative_path:
    raw_path = req.relative_path
  elif req.url:
    raw_path = urlparse(req.url).path
  if not raw_path:
    raw_path = "/page"

  segments = [seg for seg in raw_path.split("/") if seg]
  if not segments:
    segments = ["index"]

  *dir_segments, last_segment = segments
  dir_slugs = [_safe_slug(s) for s in dir_segments]
  last_slug = _safe_slug(last_segment)

  if dir_slugs:
    target_dir = target_dir.joinpath(*dir_slugs)

  target_dir.mkdir(parents=True, exist_ok=True)

  html_path = target_dir / f"{last_slug}.html"
  md_path = target_dir / f"{last_slug}.md"
  return target_dir, html_path, md_path


@app.post("/api/import-html")
async def import_html(req: ImportRequest):
  if not req.html:
    raise HTTPException(status_code=400, detail="Missing html in request body")

  _, html_path, md_path = _resolve_paths(req)
  html_path.write_text(req.html, encoding="utf-8")

  if req.output_format == "html":
    return {
      "ok": True,
      "saved_html": str(html_path),
    }

  browser_cfg = BrowserConfig.load({})

  async with AsyncWebCrawler(config=browser_cfg) as crawler:
    result = await crawler.arun(
      url=f"file://{html_path}",
      config=CrawlerRunConfig(
        markdown_generator=DefaultMarkdownGenerator(),
      ),
    )

  markdown = result.markdown or ""
  md_path.write_text(markdown, encoding="utf-8")

  return {
    "ok": True,
    "saved_html": str(html_path),
    "saved_markdown": str(md_path),
  }


@app.get("/health")
async def health():
  return {"status": "ok"}


"""
Usage
=====

1. Install dependencies (in a virtualenv):

   pip install fastapi uvicorn "crawl4ai[playwright]"
   crawl4ai-setup

2. Run the backend:

   EXPORT_BASE_DIR="/path/to/export-dir" uvicorn main:app --host 0.0.0.0 --port 8000

3. In the browser extension popup:

   - Backend URL: http://localhost:8000
   - Target folder: e.g. docs/baikal-tech
   - Output format: Markdown

The extension will send each captured page (and optional sub-links) to
/api/import-html, and this backend will save .html and .md files under EXPORT_BASE_DIR.
"""
