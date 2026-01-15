from pathlib import Path

from backend.main import ImportRequest, _resolve_paths, _safe_slug


def test_safe_slug_basic():
    assert _safe_slug("Hello World") == "Hello_World"
    assert _safe_slug("---") == "page"


def test_resolve_paths_uses_target_folder_and_url(tmp_path: Path):
    req = ImportRequest(
        html="<html></html>",
        url="https://example.com/apis/access-sessions",
        target_folder="docs/baikal-tech",
    )

    target_dir, html_path, md_path = _resolve_paths(req, base_dir=tmp_path)

    assert target_dir == tmp_path / "docs" / "baikal-tech" / "apis"
    assert html_path == target_dir / "access-sessions.html"
    assert md_path == target_dir / "access-sessions.md"


def test_resolve_paths_prefers_relative_path(tmp_path: Path):
    req = ImportRequest(
        html="<html></html>",
        url="https://example.com/ignored",
        relative_path="/products/overview",
    )

    target_dir, html_path, md_path = _resolve_paths(req, base_dir=tmp_path)

    assert target_dir == tmp_path / "products"
    assert html_path == target_dir / "overview.html"
    assert md_path == target_dir / "overview.md"


def test_resolve_paths_root_path_defaults_to_index(tmp_path: Path):
    req = ImportRequest(html="<html></html>", relative_path="/")

    target_dir, html_path, _ = _resolve_paths(req, base_dir=tmp_path)

    assert target_dir == tmp_path
    assert html_path == tmp_path / "index.html"
