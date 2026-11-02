"""Build a source-backed CCPA evaluation fixture from the exact supplied PDF.

This creates provisional reference answers for human review. It never calls
the ingestion pipeline or treats model output as a source of truth.
"""

import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pdfplumber


DEFAULT_PDF = Path(r"C:\Users\abhinav.yadav_randst\Downloads\CCPA legal text.pdf")
EXPECTED_HASH = "c31e525e2e191a549f42384e9e6108d357a7fdf4c957f1469fc8aa9ebe735f9b"
OUT = Path(__file__).resolve().parents[1] / "src/mastra/knowledge-base/ingestion/evaluation/fixtures/ccpa-2026-review-v1"
HEADER = re.compile(r"^8/20/26, 4:30 PM Codes Display Text\s*\n")
FOOTER = re.compile(r"\nhttps://leginfo\.legislature\.ca\.gov/faces/codes_displayText\.xhtml\?[^\n]+\s+\d+/35\s*$")
SECTION = re.compile(r"(?m)^(1798\.\d+(?:\.\d+)*)\.[ \t]+([^\n]+)$")


def clean_page(raw):
    value = HEADER.sub("", raw, count=1)
    value = FOOTER.sub("", value)
    return value.strip()


def exact(text, start, end=None):
    first = text.find(start)
    assert first >= 0, f"Missing source anchor: {start}"
    last = text.find(end, first + len(start)) if end else len(text)
    assert last > first, f"Missing end after {start}: {end}"
    return text[first:last].strip()


def node(citation, parent, kind, text):
    assert text
    if kind == "section":
        text = re.split(r"(?m)^\((?:Amended|Added|Repealed)\b", text, maxsplit=1)[0].strip()
    return {"id": citation, "parent": parent, "kind": kind, "exact_source_text": text}


def edge(source, target, relation, source_words):
    return {"from": source, "to": target, "relation": relation, "source_words": source_words}


def case(stage, number, title, challenge, refs, pages, expected, forbidden, severity="critical"):
    case_id = f"CCPA-{stage}-{number:02d}"
    return {
        "id": case_id, "stage": stage, "title": title, "scope": "source_native",
        "challenge_type": challenge, "split": "development", "severity": severity,
        "source_refs": refs, "physical_pages": pages,
        "input": {"mode": "inspect_frozen_ingestion_run", "task": title,
                  "source_boundary": "The ingestion model receives only the PDF and workflow instructions; expected answers and forbidden claims are evaluator-only."},
        "expected": expected, "must_not": forbidden,
        "grading": {"method": "source_backed_comparison",
                    "match_policy": "Match complete legal facts and source wording after harmless line-wrap normalization. Check each named node, its kind, parent and complete text; require actual stored edges for graph claims. Keep actors, numbers, AND/OR, exceptions, limitations and dates. Internal IDs and prose style may differ. Do not infer a passing graph from a larger ancestor text alone.",
                    "outcomes": ["pass", "fail", "not_run", "blocked_by_upstream", "needs_review"],
                    "can_be_release_gate_now": False},
        "expectation_basis": "source_facts" if stage in ("S1", "S2", "S3") else "source_facts_and_authored_product_rubric",
        "evaluation_scope": "Only listed expectations are scored. Passing does not certify the whole title or current legal status.",
        "human_review": {"status": "pending", "reviewer": None, "reviewed_at": None, "notes": ""},
    }


def main(pdf_path):
    pdf_bytes = pdf_path.read_bytes()
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    assert pdf_hash == EXPECTED_HASH, f"Expected frozen CCPA PDF {EXPECTED_HASH}; got {pdf_hash}"
    with pdfplumber.open(pdf_path) as pdf:
        assert len(pdf.pages) == 35
        raw_pages = [page.extract_text(x_tolerance=1) or "" for page in pdf.pages]
    pages = [clean_page(raw) for raw in raw_pages]
    assert all(HEADER.search(raw) and FOOTER.search(raw) for raw in raw_pages)
    starts = []
    for number, page in enumerate(pages, 1):
        for match in SECTION.finditer(page):
            # A bare 1798.185. on page 3 is a wrapped citation, not a section start.
            if not match.group(2).strip():
                continue
            starts.append({"citation": match.group(1), "physical_page": number,
                           "first_line_exact_text": match.group(0), "page_offset": match.start()})
    citations = [row["citation"] for row in starts]
    assert len(citations) == len(set(citations)), f"Duplicate heading or citation mistaken for a heading: {[c for c in citations if citations.count(c) > 1]}"
    assert all(c in citations for c in ["1798.100", "1798.105", "1798.106", "1798.140",
                                         "1798.145", "1798.150", "1798.155", "1798.192",
                                         "1798.199.10", "1798.199.100"])
    starts_by_citation = {row["citation"]: row for row in starts}
    joined = "\n".join(pages)
    page_offsets = []
    cursor = 0
    for page in pages:
        page_offsets.append(cursor)
        cursor += len(page) + 1
    for row in starts:
        row["document_offset"] = page_offsets[row["physical_page"] - 1] + row["page_offset"]
    sections = {}
    section_fragments = {}
    for index, row in enumerate(starts):
        end = starts[index + 1]["document_offset"] if index + 1 < len(starts) else len(joined)
        section_text = joined[row["document_offset"]:end].strip()
        citation = row["citation"]
        sections[citation] = section_text
        section_fragments[citation] = []
        for physical_page, page in enumerate(pages, 1):
            overlap_start = max(row["document_offset"], page_offsets[physical_page - 1])
            overlap_end = min(end, page_offsets[physical_page - 1] + len(page))
            if overlap_start < overlap_end:
                piece = joined[overlap_start:overlap_end].strip()
                if piece:
                    section_fragments[citation].append({"physical_page": physical_page, "text": piece})

    units = {f"page:{number}": {
        "comparison_text": raw, "fragments": [{"physical_page": number, "text": raw}],
        "source_method": "pdfplumber full physical page, including browser furniture",
    } for number, raw in enumerate(raw_pages, 1)}
    for citation, text in sections.items():
        units[f"section:{citation}"] = {
            "comparison_text": text, "fragments": section_fragments[citation],
            "source_method": "pdfplumber page text with repeated print header and URL footer removed; PDF may contain replacement characters",
        }
    for key, start, end in [
        ("heading:title", "TITLE 1.81.5.", "1798.100."),
    ]:
        value = exact(pages[0], start, end)
        units[key] = {"comparison_text": value, "fragments": [{"physical_page": 1, "text": value}]}

    s100, s105, s140, s145, s150 = (sections[s] for s in
                                     ["1798.100", "1798.105", "1798.140", "1798.145", "1798.150"])
    # Complete selected clauses: splitting by anchored legal numbering is only
    # used for reference construction; source excerpts remain available in full.
    p100a = exact(s100, "(a) A business", "(b) A business")
    p100d = exact(s100, "(d) A business", "(e) A business")
    p105c = exact(s105, "(c) (1) A business", "(d) A business")
    p105d = exact(s105, "(d) A business", "(Amended")
    p140d = exact(s140, "(d) ", "(e) ")
    service_provider_definition = exact(s140, "(ag) (1) ", "(ah) (1) ")
    p145a = exact(s145, "(a) (1) The obligations", "(b) The obligations")
    p145emergency = exact(p145a, "(D) (i) Cooperate", "(E) Exercise")
    p150a = exact(s150, "(a) (1) Any consumer", "(b) Actions")
    def pages_for(citation):
        return [f["physical_page"] for f in section_fragments[citation]]

    cases = [
        case("S1", 1, "Identify this California Civil Code printout and its edition boundary",
             "source_identity", ["heading:title", "page:1", "section:1798.106", "section:1798.136"], [1, 3, 9, 10],
             {"code": "California Civil Code, Division 3, Part 4, Title 1.81.5",
              "title_heading_exact_text": units["heading:title"]["comparison_text"],
              "printed_timestamp": "8/20/26, 4:30 PM",
              "amendment_examples": [
                  exact(sections["1798.106"], "(Amended by Stats. 2024", None),
                  exact(sections["1798.136"], "(Added by Stats. 2025", None)],
              "source_limit": "The printout contains section-specific amendment and operative notes; the browser print time alone does not establish that each provision was operative on that date."},
             ["Treating the print timestamp as the effective date of every section.",
              "Presenting this PDF as the complete California regulations or as a complete historical version record."]),
        case("S1", 2, "Map every section heading and separate browser furniture from law",
             "document_map", ["page:1", "page:35", "section:1798.199.10", "section:1798.199.100"], [1, 30, 35],
             {"physical_page_inventory": list(range(1, 36)),
              "section_starts": [{"section": row["citation"], "physical_page": row["physical_page"],
                                  "first_line_exact_text": row["first_line_exact_text"]} for row in starts],
              "browser_furniture": ["8/20/26, 4:30 PM Codes Display Text",
                                     "https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml"],
              "nested_decimal_examples": ["1798.199.10", "1798.199.100"]},
             ["Treating the 1/35 through 35/35 footer as provisions.",
              "Collapsing 1798.199.10 and 1798.199.100 into the same section."]),
        case("S2", 1, "Join Section 1798.100(d) across pages 1 and 2 without the print footer",
             "cross_page_boundary", ["section:1798.100", "page:1", "page:2"], [1, 2],
             {"exact_clause_text": p100d,
              "children": [exact(p100d, f"({n}) ", f"({n+1}) " if n < 5 else "(e) A business") if n < 5
                           else exact(p100d, "(5) ") for n in range(1, 6)],
              "boundary": "Paragraphs (1)-(3) are on physical page 1; paragraphs (4)-(5) continue on page 2 under 1798.100(d)."},
             ["Ending 1798.100(d) at the page-1 URL footer.",
              "Attaching paragraph (4) to Section 1798.105."]),
        case("S2", 2, "Keep the research deletion exception whole across pages 2 and 3",
             "cross_page_boundary", ["section:1798.105", "page:2", "page:3"], [2, 3],
             {"exact_clause_text": exact(p105d, "(6) Engage in public", "(7) To enable"),
              "continuation_start": "impossible or seriously impair the ability to complete such research, if the consumer has provided informed consent.",
              "parent": "Section 1798.105(d)",
              "closing_condition": "Consumer provided informed consent."},
             ["Stopping the research exception at page 2.",
              "Treating the page-3 continuation as a new standalone duty."]),
        case("S2", 3, "Preserve long definition across the page 10 to 11 break",
             "definition_boundary", ["section:1798.140", "page:10", "page:11"], [10, 11],
             {"definition_exact_text": p140d,
              "cross_page_paragraph": exact(p140d, "(3) A joint venture", "(4) A person"),
              "scope_text": "For purposes of this title:",
              "term": "Business"},
             ["Ending the joint-venture definition at page 10.",
              "Treating the continued paragraph (3) as paragraph (4)."]),
        case("S3", 1, "Build complete 1798.100 hierarchy and contract subgraph",
             "complete_subgraph", ["section:1798.100"], [1, 2],
             {"reference_tree": {"nodes": [
                 node("Section 1798.100", "Title 1.81.5", "section", s100),
                 node("Section 1798.100(a)", "Section 1798.100", "subdivision", p100a),
                 *[node(f"Section 1798.100(a)({n})", "Section 1798.100(a)", "paragraph",
                        exact(p100a, f"({n}) ", f"({n+1}) " if n < 3 else "(b) A business"))
                   if n < 3 else node("Section 1798.100(a)(3)", "Section 1798.100(a)", "paragraph",
                                     exact(p100a, "(3) ")) for n in range(1, 4)],
                 node("Section 1798.100(b)", "Section 1798.100", "subdivision",
                      exact(s100, "(b) A business", "(c) A business")),
                 node("Section 1798.100(c)", "Section 1798.100", "subdivision",
                      exact(s100, "(c) A business", "(d) A business")),
                 node("Section 1798.100(d)", "Section 1798.100", "subdivision", p100d),
                 *[node(f"Section 1798.100(d)({n})", "Section 1798.100(d)", "paragraph",
                        exact(p100d, f"({n}) ", f"({n+1}) ") if n < 5 else exact(p100d, "(5) "))
                   for n in range(1, 6)],
                 node("Section 1798.100(e)", "Section 1798.100", "subdivision",
                      exact(s100, "(e) A business", "(f) Nothing")),
                 node("Section 1798.100(f)", "Section 1798.100", "subdivision",
                      exact(s100, "(f) Nothing", "(Amended"))]},
              "reference_edges": [
                  edge("Section 1798.100(e)", "Section 1798.81.5", "explicit_external_reference",
                       "Section 1798.81.5"),
                  edge("Section 1798.100(f)", "Section 1798.185(a)(3)", "explicit_reference",
                       "paragraph (3) of subdivision (a) of Section 1798.185")],
              "contract_children_count": 5,
              "contract_parties": ["third party", "service provider", "contractor"]},
             ["Five contract requirements treated as five independent sections.",
              "Parent Section 1798.100(d) ending before page-2 paragraphs (4) and (5).",
              "Mapping external Section 1798.81.5 to Section 1798.100."]),
        case("S3", 2, "Build deletion duty with all nested exceptions",
             "complete_subgraph", ["section:1798.105", "section:1798.130"], [2, 3],
             {"reference_tree": {"nodes": [
                 node("Section 1798.105", "Title 1.81.5", "section", s105),
                 node("Section 1798.105(a)", "Section 1798.105", "subdivision",
                      exact(s105, "(a) A consumer", "(b) A business")),
                 node("Section 1798.105(b)", "Section 1798.105", "subdivision",
                      exact(s105, "(b) A business", "(c) (1)")),
                 node("Section 1798.105(c)", "Section 1798.105", "subdivision", p105c),
                 *[node(f"Section 1798.105(c)({n})", "Section 1798.105(c)", "paragraph",
                        exact(p105c, f"({n}) ", f"({n+1}) ") if n < 3 else exact(p105c, "(3) "))
                   for n in range(1, 4)],
                 node("Section 1798.105(d)", "Section 1798.105", "subdivision", p105d),
                 *[node(f"Section 1798.105(d)({n})", "Section 1798.105(d)", "paragraph",
                        exact(p105d, f"({n}) ", f"({n+1}) ") if n < 8 else exact(p105d, "(8) "))
                   for n in range(1, 9)]]},
              "reference_edges": [
                  edge("Section 1798.105(b)", "Section 1798.130", "explicit_reference",
                       "Section 1798.130")],
              "deletion_exception_count": 8,
              "research_exception": exact(p105d, "(6) Engage in public", "(7) To enable")},
             ["Deletion exception (6) stops at the page break.",
              "Converting the eight alternatives in (d) into eight simultaneous requirements."]),
        case("S3", 3, "Preserve nested emergency conditions and exception to exemption",
             "deep_nesting_and_exception", ["section:1798.145", "page:17"], [16, 17],
             {"reference_tree": {"nodes": [
                 node("Section 1798.145(a)(1)(D)", "Section 1798.145(a)(1)", "subparagraph", p145emergency),
                 node("Section 1798.145(a)(1)(D)(i)", "Section 1798.145(a)(1)(D)", "clause",
                      exact(p145emergency, "(D) (i) Cooperate", "(ii) For purposes")),
                 node("Section 1798.145(a)(1)(D)(ii)", "Section 1798.145(a)(1)(D)", "clause",
                      exact(p145emergency, "(ii) For purposes")),
                 *[node(f"Section 1798.145(a)(1)(D)(i)({roman})",
                        "Section 1798.145(a)(1)(D)(i)", "subclause",
                        exact(p145emergency, f"({roman}) ", f"({['I','II','III'][index+1]}) ")
                        if index < 2 else exact(p145emergency, "(III) ", "(ii) For purposes"))
                   for index, roman in enumerate(["I", "II", "III"])]]},
              "exception_to_exemption_exact_text": exact(p145a, "(2) (A) This subdivision"),
              "emergency_conditions_are_conjunctive": True},
             ["Treating the three emergency conditions as OR alternatives.",
              "Dropping the (a)(2)(A) exception that limits subdivision (a)."]),
        case("S3", 4, "Keep decimal section IDs distinct and retain operative date",
             "decimal_numbering_and_version", ["section:1798.136", "section:1798.140",
                                               "section:1798.199", "section:1798.199.10"], [9, 10, 30],
             {"reference_tree": {"nodes": [node(f"Section {c}", "Title 1.81.5", "section", sections[c])
                        for c in ["1798.136", "1798.140", "1798.199", "1798.199.10"]]},
              "operative_date_exact_text": exact(sections["1798.136"], "(f) This section", "(Added by Stats.")},
             ["Treating Section 1798.199 as the parent of Section 1798.199.10.",
              "Treating the 1798.136 operative date as a date for every section."]),
        case("S3", 5, "Follow breach remedy references without confusing monetary caps",
             "multi_hop_and_external_law", ["section:1798.150", "section:1798.155",
                                            "section:1798.199.95"], [24, 34, 35],
             {"reference_tree": {"nodes": [
                 node("Section 1798.150(a)(1)", "Section 1798.150(a)", "paragraph",
                      exact(p150a, "(a) (1) Any consumer", "(2) In assessing")),
                 node("Section 1798.150(a)(1)(A)", "Section 1798.150(a)(1)", "subparagraph",
                      exact(p150a, "(A) To recover damages", "(B) Injunctive")),
                 node("Section 1798.199.95(d)", "Section 1798.199.95", "subdivision",
                      exact(sections["1798.199.95"], "(d) (1) On January 1", "(Amended"))]},
              "reference_edges": [
                 edge("Section 1798.150(a)(1)", "Section 1798.81.5(d)(1)(A)",
                      "explicit_external_reference",
                      "subparagraph (A) of paragraph (1) of subdivision (d) of Section 1798.81.5"),
                 edge("Section 1798.150(a)(1)(A)", "Section 1798.199.95(d)",
                      "explicit_reference", "subdivision (d) of Section 1798.199.95"),
                 edge("Section 1798.155(a)", "Section 1798.199.95(d)",
                      "explicit_reference", "subdivision (d) of Section 1798.199.95")],
              "multi_hop_paths": [{
                  "path": ["Section 1798.150(a)(1)", "Section 1798.150(a)(1)(A)",
                           "Section 1798.199.95(d)"],
                  "relation_sequence": ["contains", "explicit_reference"]}],
              "private_action_source": exact(p150a, "(a) (1) Any consumer", "(2) In assessing"),
              "administrative_fine_source": exact(sections["1798.155"], "(a) Any business", "(b) (1)")},
             ["Treating $750 private statutory damages and $7,500 administrative fine as the same remedy.",
              "Inventing a local Section 1798.81.5 inside Title 1.81.5."]),
        case("S4", 1, "Interpret deletion duty and its eight separate exceptions",
             "legal_meaning", ["section:1798.105"], [2, 3],
             {"actor": "business receiving a verifiable deletion request",
              "duties": ["delete from its records", "notify service providers or contractors",
                         "notify third parties to whom information was sold or shared unless impossible or disproportionate effort"],
              "exceptions_source": p105d,
              "exception_logic": "The eight 1798.105(d) grounds are alternatives subject to their own conditions."},
             ["Claiming every deletion request must be refused if any exception could apply."]),
        case("S4", 2, "Interpret breach remedy versus administrative enforcement",
             "legal_meaning", ["section:1798.150", "section:1798.155"], [24],
             {"private_action_scope": exact(sections["1798.150"], "(c) The cause of action", "(Amended"),
              "damages_range_source": exact(p150a, "(A) To recover damages", "(B) Injunctive"),
              "administrative_fine_source": exact(sections["1798.155"], "(a) Any business", "(b) (1)")},
             ["Treating any CCPA violation as giving a private right of action under 1798.150.",
              "Calling statutory damages a fixed fine without the statutory conditions."]),
        case("S5", 1, "Generate analysis evidence guidance for third-party contracts",
             "analysis_guidance", ["section:1798.100"], [1, 2],
             {"mandatory_from_source": p100d,
              "evidence_queries": ["agreement with third party, service provider, or contractor",
                                   "limited and specified purposes", "same level of privacy protection",
                                   "notification if obligations can no longer be met", "right to stop and remediate unauthorized use"],
              "proof_standard": "Check the actual agreement and its parties; absence of supplied evidence is not proof of a real-world breach."},
             ["Marking compliance solely because a contract exists without checking the five terms."]),
        case("S5", 2, "Generate drafting guidance with accurate deletion and exception treatment",
             "drafting_guidance", ["section:1798.105", "section:1798.130"], [2, 3, 6],
             {"legal_source": [exact(s105, "(a) A consumer", "(b) A business"), p105c, p105d],
              "drafting_guidance": ["describe consumer deletion request", "describe processor and third-party notices",
                                    "identify applicable exceptions conditionally"]},
             ["Drafting an unconditional promise to delete even where a source exception applies."]),
        case("S6", 1, "Retrieve contract duty with continuation and source links",
             "retrieval_context", ["section:1798.100", "section:1798.140"], [1, 2, 10, 11],
             {"query": "What must the business contract with a service provider include?",
              "required_passages": [p100d, service_provider_definition],
              "context_action": "Return all five 1798.100(d) terms and relevant provider definition with source citations."},
             ["Returning only the first three contract terms from page 1."]),
        case("S6", 2, "Retrieve breach remedy with correct external and adjustment links",
             "retrieval_context", ["section:1798.150", "section:1798.155",
                                   "section:1798.199.95"], [24, 34, 35],
             {"query": "What are the private and administrative remedies for a data breach?",
              "required_passages": [sections["1798.150"], sections["1798.155"], sections["1798.199.95"]],
              "external_reference_status": "1798.81.5 is cited but is outside this PDF's displayed Title 1.81.5."},
             ["Answering from a bare $750 figure without the qualifying breach and notice conditions."]),
        case("S7", 1, "Answer a business request about deletion without losing exceptions",
             "legal_qa", ["section:1798.105", "section:1798.130"], [2, 3, 6],
             {"question": "A customer asked us to delete their data. Must we always erase everything?",
              "answer_requirements": ["cite 1798.105(c) duty and downstream notices",
                                      "explain 1798.105(d) conditional grounds separately",
                                      "state that this PDF does not establish the facts of the customer's case"]},
             ["Saying deletion is always mandatory or always optional."]),
        case("S7", 2, "Review a processor agreement against all five source terms",
             "analysis_use", ["section:1798.100"], [1, 2],
             {"scenario": "A contract is supplied with purpose and privacy terms, but no notification if the processor cannot comply and no stop/remediate right.",
              "expected_conclusion": ["test all five 1798.100(d) terms", "identify missing terms (4) and (5)",
                                      "cite the exact clause and distinguish missing contract evidence from real-world violation"]},
             ["Passing the agreement because the first three terms are present."]),
    ]

    # A selected source must exist, and verbatim node and edge anchors must occur
    # in the independent PDF extraction. This is an anchor check, not legal review.
    checked_nodes = 0
    checked_edges = 0
    def verify(value):
        nonlocal checked_nodes, checked_edges
        if isinstance(value, dict):
            if "exact_source_text" in value:
                assert value["exact_source_text"] in joined, value.get("id")
                checked_nodes += 1
            if {"from", "to", "source_words"}.issubset(value):
                assert " ".join(value["source_words"].split()) in " ".join(joined.split()), value
                checked_edges += 1
            for child in value.values():
                verify(child)
        elif isinstance(value, list):
            for child in value:
                verify(child)
    for row in cases:
        verify(row["expected"])
    for row in cases:
        for ref in row["source_refs"]:
            assert ref in units, (row["id"], ref)
        assert all(1 <= page <= 35 for page in row["physical_pages"])
    for citation in ["1798.100", "1798.105", "1798.140", "1798.145", "1798.150"]:
        assert sections[citation].startswith(citation + ".")
    OUT.mkdir(parents=True, exist_ok=True)
    dataset = {
        "schema_version": "ccpa-review-dataset/1.0",
        "dataset_id": "ccpa-civ-title-1-81-5-2026-review-v1",
        "source_family": "California-Civil-Code-Title-1.81.5",
        "status": "draft_for_human_review", "split": "development",
        "source": {"sha256": pdf_hash, "byte_size": len(pdf_bytes), "page_count": 35,
                   "filename": pdf_path.name, "local_path": str(pdf_path),
                   "source_type": "California Legislative Information browser printout",
                   "edition_note": "Printed 20 August 2026. Per-section amendment and operative notes must be retained; this PDF alone is not a complete regulatory or historical record."},
        "stages": {"S1": "Source identity and classification", "S2": "Text extraction and complete boundaries",
                   "S3": "Document tree and relationships", "S4": "Legal meaning",
                   "S5": "Generated module guidance", "S6": "Retrieval and publication",
                   "S7": "Use in analysis, drafting and Q&A"},
        "coverage_policy": "Selected difficult passages are checked completely within stated scope. Section-heading inventory covers the displayed title; full text of every section is not gold-reviewed.",
        "cases": cases,
    }
    pack = {"source_sha256": pdf_hash, "units": units}
    template = {"dataset_id": dataset["dataset_id"], "source_sha256": pdf_hash, "run_id": None,
                "provider": None, "model": None, "prompt_version": None,
                "pipeline_version": None, "reasoning_setting": None,
                "model_assignments": [], "artifacts": {},
                "results": [{"case_id": row["id"], "status": "not_run", "observed": None,
                             "evidence_refs": [], "failed_expected_fields": [],
                             "forbidden_claims_found": [], "reviewer_notes": ""}
                            for row in cases]}
    for name, data in [("dataset.json", dataset), ("source-passages.json", pack),
                       ("pages.json", {"source_sha256": pdf_hash, "pages": [
                           {"physical_page": i, "raw_text": raw_pages[i-1], "cleaned_text": pages[i-1]}
                           for i in range(1, 36)]}),
                       ("run-results.template.json", template),
                       ("validation-report.json", {
                           "status": "automatic_source_checks_passed_human_review_pending",
                           "pdf_sha256": pdf_hash, "case_count": len(cases),
                           "section_headings_located": len(starts),
                           "graph_nodes_source_anchored": checked_nodes,
                           "graph_edges_source_anchored": checked_edges,
                           "all_source_refs_resolved": True,
                           "warning": "Human review must compare exact text and legal interpretation with the original visual PDF. S4-S7 cases cannot be scored from S1-S3 graph output."})]:
        (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    cards = []
    for row in cases:
        source_html = "".join(
            f"<details><summary>{html.escape(ref)}</summary><pre>{html.escape(units[ref]['comparison_text'])}</pre></details>"
            for ref in row["source_refs"])
        cards.append(f"<article><h2>{html.escape(row['id'])}: {html.escape(row['title'])}</h2>"
                     f"<p>{html.escape(row['challenge_type'])} · pages {row['physical_pages']}</p>"
                     f"<div class='columns'><section><h3>Original PDF passages</h3>{source_html}</section>"
                     f"<section><h3>Expected and forbidden</h3><pre>{html.escape(json.dumps({'expected': row['expected'], 'must_not': row['must_not']}, indent=2, ensure_ascii=False))}</pre></section></div>"
                     f"<p>Human review: pending</p></article>")
    review_html = ("<!doctype html><html lang='en'><meta charset='utf-8'><title>CCPA ingestion fixture review</title>"
                   "<style>body{font:15px system-ui;margin:2rem;color:#1d2939}article{border:1px solid #cbd5e1;padding:1.2rem;margin:1.5rem 0}"
                   ".columns{display:grid;grid-template-columns:1fr 1fr;gap:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc;padding:1rem}"
                   "summary{cursor:pointer}details{margin:.6rem 0}@media(max-width:850px){.columns{grid-template-columns:1fr}}</style>"
                   "<h1>CCPA source-backed evaluation draft</h1><p>All expectations need human legal review. "
                   "The PDF printout is the source; model output was not used to create this fixture.</p>"
                   + "".join(cards) + "</html>")
    (OUT / "review.html").write_text(review_html, encoding="utf-8")
    print(f"Wrote {len(cases)} provisional CCPA cases and {len(starts)} section headings to {OUT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    main(parser.parse_args().pdf)
