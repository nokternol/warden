#!/usr/bin/env python3
"""Deterministic doc-to-code reference linker for plan-with-graph.

Problem this solves: graphify's own extraction never creates edges from a
markdown doc's prose to the code symbols/files it names, confirmed empirically
by live testing. Fixing that inside graphify (its LLM subagent pass, or its
build_merge dedup step) was tried and rejected: expensive, and the merge step
silently drops exactly these edges on node-fold collisions. This script never
writes to graphify internals and never creates a new node — it only adds
`references` edges between nodes that already exist (it does import
graphify.detect read-only, to check .graphifyignore via the same matcher
graphify itself uses, rather than a second hand-rolled copy of that policy).

Deliberate, not implicit: this does NOT scan arbitrary backtick spans and
guess whether they're a label, a filename, or a full path (that was tried,
worked, but conflates "inline code for readability" with "this is a graph
reference" and leaves the target-identification mode implicit). Instead it
requires an explicit, unambiguous markup the doc author opts into:

    [display text](ref:label:ExactNodeLabel)
    [display text](ref:path:relative/path/from/repo/root.ts)

`ref:label:` resolves against a node's `label` field (must match exactly one
node). `ref:path:` resolves against a node's `source_file` field (must match
exactly one node - normally the whole-file node). Anything not written in
this form is not touched, on purpose.

Idempotent: every edge this script writes is tagged `"contributor":
"plan-with-graph-linker"`. Re-running it for the same doc first removes every
edge it previously wrote for that doc, then re-adds fresh ones from the
doc's current text - safe to run any number of times, from any trigger
(end of a plan-with-graph session, a git hook, a manual re-check), without
accumulating duplicates or depending on any other pipeline having run first.

Usage:
    python3 link_doc_to_code.py docs/architecture/warden-core-model.md
    python3 link_doc_to_code.py docs/architecture/warden-core-model.md --apply
    python3 link_doc_to_code.py docs/architecture/warden-core-model.md --apply --graph graphify-out/graph.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REF_PATTERN = re.compile(r"\[([^\]]+)\]\(ref:(label|path):([^)]+)\)")
HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.*)$")
CONTRIBUTOR = "plan-with-graph-linker"


def is_graphify_ignored(doc_path: Path, repo_root: Path) -> bool:
    """True if .graphifyignore excludes this doc from the graph.

    Imports graphify's own matcher rather than reimplementing gitignore
    semantics (anchoring, negation, the parent-exclusion rule) a second time -
    that duplication is exactly what let this script's notion of "should this
    doc be linked" drift from .graphifyignore's actual policy before. This is
    the single source of truth; nothing here re-decides which docs count.
    """
    try:
        from graphify.detect import _is_ignored, _load_graphifyignore
    except ImportError:
        raise SystemExit(
            "error: could not import graphify to check .graphifyignore. Run this "
            "script with the Python graphify is installed in (see "
            "graphify-out/.graphify_python for its path)."
        )
    patterns = _load_graphifyignore(repo_root)
    return _is_ignored(doc_path.resolve(), repo_root, patterns)


def load_graph(graph_path: Path) -> dict:
    if not graph_path.exists():
        raise SystemExit(
            f"error: {graph_path} does not exist. Run graphify's normal build/update "
            "first so the doc's own structural nodes (title, headings) exist - this "
            "script only adds edges onto nodes that are already there, it never "
            "creates one."
        )
    return json.loads(graph_path.read_text(encoding="utf-8"))


def index_nodes(graph: dict) -> tuple[dict, dict]:
    by_label: dict[str, list[str]] = {}
    by_source_file: dict[str, list[str]] = {}
    for n in graph["nodes"]:
        by_label.setdefault(n["label"], []).append(n["id"])
        sf = n.get("source_file")
        if sf:
            by_source_file.setdefault(sf, []).append(n["id"])
    return by_label, by_source_file


def find_section_nodes(graph: dict, doc_path: str) -> dict[str, str]:
    """Map heading text -> existing node id, for every document-type node
    already extracted from this doc. Never invents an id - if a heading in
    the doc's current text has no corresponding node yet, it's reported as
    unresolvable (the doc needs a graphify build/update pass first)."""
    out: dict[str, str] = {}
    for n in graph["nodes"]:
        if n.get("source_file") == doc_path and n.get("file_type") == "document":
            out[n["label"]] = n["id"]
    return out


def parse_doc_refs(doc_path: Path, section_ids: dict[str, str]) -> list[tuple[str, str, str, str, int]]:
    """Returns list of (section_node_id, mode, target_text, display_text, line_no)."""
    doc_label = doc_path.stem.replace("-", " ").replace("_", " ")
    # doc-root fallback: whichever section node's label matches the doc's own
    # title line (first line, "# Title") - looked up same as any heading.
    current_section_label: str | None = None
    refs = []
    for i, line in enumerate(doc_path.read_text(encoding="utf-8").split("\n"), start=1):
        m = HEADING_PATTERN.match(line)
        if m:
            current_section_label = m.group(2).strip()
            continue
        for disp, mode, target in REF_PATTERN.findall(line):
            section_label = current_section_label
            section_id = section_ids.get(section_label) if section_label else None
            if section_id is None:
                # fall back to the doc's own root/title node if no heading seen yet
                for label, nid in section_ids.items():
                    if label.strip().lower() == doc_label.strip().lower():
                        section_id = nid
                        break
            refs.append((section_id, mode, target.strip(), disp, i))
    return refs


def resolve(mode: str, target: str, by_label: dict, by_source_file: dict) -> tuple[str | None, str]:
    if mode == "label":
        matches = by_label.get(target, [])
    else:
        # source_file is shared by every symbol extracted from that file, not just
        # the file itself - narrow to the file-level node, never guess between the
        # file and the symbols inside it. graphify labels a file node with its bare
        # filename, or with as many trailing path segments as it takes to tell apart
        # files that share a basename (`kernel/container.ts`, `modules/index.ts`,
        # the full `contract/scope.ts`), so accept any trailing-segment suffix.
        parts = Path(target).parts
        suffixes = {"/".join(parts[i:]) for i in range(len(parts))}
        file_level = {nid for s in suffixes for nid in by_label.get(s, [])}
        matches = [nid for nid in by_source_file.get(target, []) if nid in file_level]
    if len(matches) == 1:
        return matches[0], "ok"
    if len(matches) == 0:
        return None, "no matching node - check spelling, or run graphify build/update first"
    return None, f"ambiguous - {len(matches)} nodes match, refusing to guess: {matches}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("doc", type=Path, help="markdown doc to link, path relative to repo root")
    ap.add_argument("--graph", type=Path, default=Path("graphify-out/graph.json"))
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run, report only)")
    args = ap.parse_args()

    doc_path_str = str(args.doc)
    repo_root = Path.cwd()
    if is_graphify_ignored(args.doc, repo_root):
        print(f"{args.doc}: excluded by .graphifyignore - not graphed, nothing to link. Skipping.")
        return

    graph = load_graph(args.graph)
    by_label, by_source_file = index_nodes(graph)
    section_ids = find_section_nodes(graph, doc_path_str)

    if not section_ids:
        print(
            f"warning: no document-type nodes found for source_file == {doc_path_str!r}. "
            "This doc may not have been ingested by graphify yet - run a build/update "
            "pass first so its title/heading nodes exist, then re-run this script.",
            file=sys.stderr,
        )

    refs = parse_doc_refs(args.doc, section_ids)
    if not refs:
        print(f"No [text](ref:label:...) / [text](ref:path:...) markup found in {args.doc}.")
        return

    resolved_edges = []
    problems = []
    for section_id, mode, target, disp, line_no in refs:
        if section_id is None:
            problems.append(f"  line {line_no}: {disp!r} -> ref:{mode}:{target} - source section unresolved (no heading node found yet)")
            continue
        target_id, status = resolve(mode, target, by_label, by_source_file)
        if target_id is None:
            problems.append(f"  line {line_no}: {disp!r} -> ref:{mode}:{target} - {status}")
            continue
        if target_id == section_id:
            problems.append(f"  line {line_no}: {disp!r} -> ref:{mode}:{target} - resolves to its own section, skipped")
            continue
        resolved_edges.append({
            "source": section_id,
            "target": target_id,
            "relation": "references",
            "confidence": "EXTRACTED",
            "confidence_score": 1.0,
            "source_file": doc_path_str,
            "source_location": f"L{line_no}",
            "weight": 1.0,
            "contributor": CONTRIBUTOR,
        })

    print(f"{args.doc}: {len(refs)} explicit ref(s) found, {len(resolved_edges)} resolved, {len(problems)} unresolved")
    if problems:
        print("Unresolved:")
        for p in problems:
            print(p)

    if not args.apply:
        print("\n(dry run - pass --apply to write these edges)")
        return

    links_key = "links" if "links" in graph else "edges"
    before = len(graph[links_key])
    graph[links_key] = [
        e for e in graph[links_key]
        if not (e.get("contributor") == CONTRIBUTOR and e.get("source_file") == doc_path_str)
    ]
    removed = before - len(graph[links_key])
    graph[links_key].extend(resolved_edges)
    args.graph.write_text(json.dumps(graph), encoding="utf-8")
    print(f"Applied: removed {removed} stale linker-owned edge(s) for this doc, added {len(resolved_edges)} fresh edge(s).")


if __name__ == "__main__":
    main()
