"""Build source-backed Article 28/32 S3 expectations from the frozen GDPR source pack.

This is an evaluation fixture authoring tool, not part of the ingestion pipeline.
It preserves extracted wording and keeps explicit references separate from paths.
"""

import json
import re
from hashlib import sha256
from pathlib import Path


BASE = Path(__file__).resolve().parents[1] / "src/mastra/knowledge-base/ingestion/evaluation/fixtures/gdpr-review-v1"
DATASET = BASE / "dataset.json"
SOURCE = BASE / "source-passages.json"


def article_text(source_pack, number):
    fragments = source_pack["units"][f"article:{number}"]["fragments"]
    parts = []
    for index, fragment in enumerate(fragments):
        text = fragment["text"]
        if index:
            # The running Official Journal line is not part of the legal provision.
            text = re.sub(r"^L 119/\d+ EN Official Journal of the European Union 4\.5\.2016\n", "", text)
        parts.append(text.rstrip())
    return "\n".join(parts)


def numbered_paragraphs(text, article_number):
    matches = list(re.finditer(r"(?m)^(\d{1,2})\. ", text))
    assert matches, f"No numbered paragraphs in Article {article_number}"
    result = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        result[f"Article {article_number}({match.group(1)})"] = text[match.start():end].strip()
    return result


def letter_points(paragraph, article_number, paragraph_number, letters):
    matches = list(re.finditer(r"(?m)^\(([a-z])\) ", paragraph))
    actual = [match.group(1) for match in matches]
    assert actual == list(letters), (article_number, paragraph_number, actual)
    points = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(paragraph)
        if article_number == 28 and index == len(matches) - 1:
            end = paragraph.index("\nWith regard to point (h)", match.start())
        points[f"Article {article_number}({paragraph_number})({match.group(1)})"] = paragraph[match.start():end].strip()
    return points


def node(identifier, parent, text, *, kind="provision"):
    return {"id": identifier, "parent": parent, "kind": kind, "exact_source_text": text}


def edge(source, target, *, wording=None, role="explicit_reference"):
    item = {"from": source, "to": target, "type": role}
    if wording:
        item["source_wording"] = wording
    return item


def validate_gold(nodes, edges, article_text):
    by_id = {item["id"]: item for item in nodes}
    assert len(by_id) == len(nodes), "Duplicate expected graph node"
    for item in nodes:
        assert item["exact_source_text"] and item["exact_source_text"] in article_text, item["id"]
        if item["parent"] in by_id:
            assert item["exact_source_text"] in by_id[item["parent"]]["exact_source_text"], item["id"]
    for item in edges:
        assert item["from"] in by_id, item
        assert item["source_wording"] in by_id[item["from"]]["exact_source_text"], item


def main():
    before_hash = json.loads((BASE / "audit-report.json").read_text(encoding="utf-8"))["revised_dataset_sha256"]
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    source_pack = json.loads(SOURCE.read_text(encoding="utf-8"))
    cases = {case["id"]: case for case in dataset["cases"]}
    article28 = article_text(source_pack, 28)
    article32 = article_text(source_pack, 32)
    para28 = numbered_paragraphs(article28, 28)
    para32 = numbered_paragraphs(article32, 32)
    assert len(para28) == 10 and len(para32) == 4
    points28 = letter_points(para28["Article 28(3)"], 28, 3, "abcdefgh")
    points32 = letter_points(para32["Article 32(1)"], 32, 1, "abcd")
    second = para28["Article 28(3)"].split("\nWith regard to point (h)", 1)
    assert len(second) == 2
    second_text = "With regard to point (h)" + second[1]

    nodes28 = [node("Article 28", "Chapter IV / Section 1", article28, kind="article")]
    nodes28 += [node(identifier, "Article 28", text, kind="paragraph") for identifier, text in para28.items()]
    nodes28 += [node(identifier, "Article 28(3)", text, kind="point") for identifier, text in points28.items()]
    nodes28.append(node("Article 28(3), second subparagraph", "Article 28(3)", second_text, kind="subparagraph"))
    nodes32 = [node("Article 32", "Chapter IV / Section 2", article32, kind="article")]
    nodes32 += [node(identifier, "Article 32", text, kind="paragraph") for identifier, text in para32.items()]
    nodes32 += [node(identifier, "Article 32(1)", text, kind="point") for identifier, text in points32.items()]

    refs28 = [
        edge("Article 28(3)(c)", "Article 32", wording="Article 32"),
        edge("Article 28(3)(d)", "Article 28(2)", wording="paragraphs 2 and 4"),
        edge("Article 28(3)(d)", "Article 28(4)", wording="paragraphs 2 and 4"),
        edge("Article 28(3)(e)", "Chapter III", wording="Chapter III"),
        edge("Article 28(3)(h)", "Article 28", wording="this Article"),
        *[edge("Article 28(3)(f)", f"Article {n}", wording="Articles 32 to 36") for n in range(32, 37)],
        edge("Article 28(3), second subparagraph", "Article 28(3)(h)", wording="point (h) of the first subparagraph"),
        edge("Article 28(4)", "Article 28(3)", wording="paragraph 3"),
        edge("Article 28(5)", "Article 40", wording="Article 40"),
        edge("Article 28(5)", "Article 42", wording="Article 42"),
        edge("Article 28(5)", "Article 28(1)", wording="paragraphs 1 and 4"),
        edge("Article 28(5)", "Article 28(4)", wording="paragraphs 1 and 4"),
        *[edge("Article 28(6)", f"Article 28({n})", wording="paragraphs 3 and 4" if n in (3, 4) else "paragraphs 7 and 8") for n in (3, 4, 7, 8)],
        edge("Article 28(6)", "Article 42", wording="Articles 42 and 43"),
        edge("Article 28(6)", "Article 43", wording="Articles 42 and 43"),
        *[edge("Article 28(7)", f"Article 28({n})", wording="paragraph 3 and 4") for n in (3, 4)],
        edge("Article 28(7)", "Article 93(2)", wording="Article 93(2)"),
        *[edge("Article 28(8)", f"Article 28({n})", wording="paragraph 3 and 4") for n in (3, 4)],
        edge("Article 28(8)", "Article 63", wording="Article 63"),
        *[edge("Article 28(9)", f"Article 28({n})", wording="paragraphs 3 and 4") for n in (3, 4)],
        *[edge("Article 28(10)", f"Article {n}", wording="Articles 82, 83 and 84") for n in (82, 83, 84)],
    ]
    refs32 = [
        edge("Article 32(3)", "Article 40", wording="Article 40"),
        edge("Article 32(3)", "Article 42", wording="Article 42"),
        edge("Article 32(3)", "Article 32(1)", wording="paragraph 1 of this Article"),
    ]
    validate_gold(nodes28, refs28, article28)
    validate_gold(nodes32, refs32, article32)

    first = cases["GDPR-S3-01"]
    first["title"] = "Reconstruct complete Article 28 tree and explicit references"
    first["focus"] = "Check every paragraph, point, inherited introduction, second subparagraph, exact source passage and explicit reference in Article 28."
    first["why_it_matters"] = "A few correct labels can hide missing text, wrong parents or missed distant references."
    first["input"]["instruction"] = first["title"]
    first["source_refs"] = ["article:28", "page:47", "page:49", "page:50"]
    first["grading"]["gold_scope"] = "Every Article 28 node and named explicit provision reference listed in this case."
    first["grading"]["source_text_policy"] = "Match exact legal wording to the PDF; permit layout line-break normalization and exclude running headers."
    first["expected"] = {
        "reference_tree": {"nodes": nodes28},
        "explicit_reference_edges": refs28,
        "inherited_context": {
            "children": list(points28),
            "from": "Article 28(3) introduction",
            "required_parent_text": second[0].split("\n(a) ", 1)[0].strip(),
        },
        "source_coverage": "Every Article 28 paragraph and point must be present, with source locations across pages 49–50. The second subparagraph remains under Article 28(3).",
    }
    first["must_not"] = [
        "Treat points (a) through (h) as independent rules without Article 28(3)'s contract introduction.",
        "Attach the second subparagraph after point (h) to Article 28(4).",
        "Mark a referenced provision as legally applicable merely because a citation edge exists.",
    ]
    first["audit"]["status"] = "expanded_source_backed_gold_draft; human_review_pending"
    first["audit"]["source_refs_checked"] = first["source_refs"]
    first["evaluation_scope"] = "Scores the complete Article 28 structure and its named explicit provision references listed here. Passing does not certify unrelated GDPR articles."

    second_case = cases["GDPR-S3-02"]
    second_case["title"] = "Resolve Article 28(3)(c) through Article 32 and its further links"
    second_case["focus"] = "Check the Article 28(3)(c) link, Article 32's full nested structure, and Article 32(3)'s further references."
    second_case["why_it_matters"] = "Finding Article 32 alone can still leave its security conditions, child points and optional compliance evidence unavailable."
    second_case["input"]["instruction"] = second_case["title"]
    second_case["source_refs"] = ["article:28", "article:32", "article:40", "article:42", "page:49", "page:51", "page:52"]
    second_case["grading"]["gold_scope"] = "Article 28(3)(c) to the complete Article 32 tree, its named explicit provision references and the five listed paths."
    second_case["grading"]["source_text_policy"] = "Match exact legal wording to the PDF; permit layout line-break normalization and exclude running headers."
    second_case["expected"] = {
        "entry_edge": edge("Article 28(3)(c)", "Article 32", wording="Article 32"),
        "article_32_reference_tree": {"nodes": nodes32},
        "article_32_explicit_reference_edges": refs32,
        "multi_hop_paths": [
            {"path": ["Article 28(3)(c)", "Article 32", "Article 32(1)"], "purpose": "Read the main risk-adjusted security obligation and points (a)–(d), with the Article 32(1) introduction.", "relationship": "explicit_reference_then_hierarchy"},
            {"path": ["Article 28(3)(c)", "Article 32", "Article 32(2)"], "purpose": "Read the risk-assessment context.", "relationship": "explicit_reference_then_hierarchy"},
            {"path": ["Article 28(3)(c)", "Article 32", "Article 32(3)", "Article 40"], "purpose": "Preserve the optional code-of-conduct route for demonstrating Article 32(1) compliance.", "relationship": "explicit_reference_then_hierarchy_then_explicit_reference", "application": "optional; the citation does not make certification mandatory"},
            {"path": ["Article 28(3)(c)", "Article 32", "Article 32(3)", "Article 42"], "purpose": "Preserve the optional certification route for demonstrating Article 32(1) compliance.", "relationship": "explicit_reference_then_hierarchy_then_explicit_reference", "application": "optional; the citation does not make certification mandatory"},
            {"path": ["Article 28(3)(c)", "Article 32", "Article 32(4)"], "purpose": "Preserve the separate instruction duty for persons acting under the controller or processor.", "relationship": "explicit_reference_then_hierarchy"},
        ],
        "source_coverage": "All four Article 32 paragraphs and points (a)–(d) must retain their original text and source locations across pages 51–52.",
    }
    second_case["must_not"] = [
        "Stop at the Article 32 title without preserving paragraphs 1–4 and points 1(a)–(d).",
        "Treat Article 32(3)'s approved code of conduct or certification mechanism as mandatory security measures.",
        "Flatten Article 32(1)(a)–(d) into unconditional requirements divorced from the risk-based and 'as appropriate' introduction.",
    ]
    second_case["physical_pages"] = [49, 51, 52]
    second_case["evaluation_scope"] = "Scores the complete Article 32 structure and the listed direct and multi-hop paths reached from Article 28(3)(c). Other paths beyond this subgraph are outside this case."
    second_case["audit"]["status"] = "expanded_source_backed_gold_draft; human_review_pending"
    second_case["audit"]["source_refs_checked"] = second_case["source_refs"]

    dataset["fixture_revision"] = "1.2-expanded-s3-gold-draft"

    DATASET.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "revision": dataset["fixture_revision"],
        "changed_cases": ["GDPR-S3-01", "GDPR-S3-02"],
        "source_basis": "Frozen PDF-derived source-passages.json; Article 28 fragments occur on physical pages 49–50 and Article 32 fragments on pages 51–52.",
        "gold_scope": "Complete Article 28 and 32 local hierarchies, named explicit provision references within them, and selected cross-article traversal paths.",
        "graph_check_counts": {"article_28_nodes": len(nodes28), "article_28_named_edges": len(refs28),
                               "article_32_nodes": len(nodes32), "article_32_named_edges": len(refs32),
                               "multi_hop_paths": 5},
        "human_review_status": "pending",
        "pipeline_stage_3_status": "not_run",
        "previous_dataset_sha256": before_hash,
        "current_dataset_sha256": sha256(DATASET.read_bytes()).hexdigest(),
    }
    (BASE / "s3-expansion-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Updated S3-01 with {len(nodes28)} nodes and {len(refs28)} explicit edges")
    print(f"Updated S3-02 with {len(nodes32)} nodes, {len(refs32)} explicit edges and 5 traversed paths")


if __name__ == "__main__":
    main()
