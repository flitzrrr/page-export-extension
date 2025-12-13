from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple


@dataclass
class TreeEntry:
    depth: int
    path: Path  # absolute path


def walk_markdown(root: Path, max_depth: int | None = None) -> List[TreeEntry]:
    root = root.resolve()
    entries: List[TreeEntry] = []

    def _walk(current: Path, depth: int) -> None:
        if max_depth is not None and depth > max_depth:
            return

        # Sort: directories first, then files
        children = sorted(current.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        for child in children:
            rel = child.relative_to(root)
            if child.is_dir():
                entries.append(TreeEntry(depth, child))
                _walk(child, depth + 1)
            elif child.suffix.lower() == ".md":
                entries.append(TreeEntry(depth, child))

    _walk(root, depth=0)
    return entries


def format_tree(entries: Iterable[TreeEntry], root: Path) -> str:
    lines: List[str] = []
    for entry in entries:
        rel = entry.path.relative_to(root)
        indent = "  " * entry.depth
        prefix = "📁" if entry.path.is_dir() else "📄"
        lines.append(f"{indent}{prefix} {rel}")
    return "\n".join(lines)


def write_index_md(entries: Iterable[TreeEntry], root: Path, index_path: Path) -> None:
    lines: List[str] = ["# Index", ""]
    for entry in entries:
        if entry.path.is_dir():
            continue
        rel = entry.path.relative_to(root)
        # Use directory depth for Markdown indentation
        depth = len(rel.parents) - 1  # 0 for files in root
        indent = "  " * depth
        lines.append(f"{indent}- [{rel.stem}]({rel.as_posix()})")
    index_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a tree view and index.md for exported crawl4ai Markdown."
    )
    parser.add_argument(
        "root",
        help="Root directory where the backend wrote Markdown files (e.g. /Users/Martin/exports/crawl4ai/docs/baikal-tech)",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=None,
        help="Maximum depth to traverse (like tree -L). Default: unlimited.",
    )
    parser.add_argument(
        "--index-name",
        default="index.md",
        help="Name of the generated index file (default: index.md).",
    )
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists():
        raise SystemExit(f"Root directory does not exist: {root}")

    entries = walk_markdown(root, max_depth=args.max_depth)

    print("Tree:")
    print(format_tree(entries, root))
    print()

    index_path = root / args.index_name
    write_index_md(entries, root, index_path)
    print(f"Index written to: {index_path}")


if __name__ == "__main__":
    main()

