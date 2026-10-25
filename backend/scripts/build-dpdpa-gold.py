"""Build a source-backed, human-reviewable DPDP Act evaluation fixture.

Run with a Python environment containing pdfplumber. The user's original Gazette
PDF is the source. This does not run the ingestion model or approve legal gold.
"""

import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pdfplumber


PDF = Path(r"C:\Users\abhinav.yadav_randst\Downloads\DPDPA-2023 Act.pdf")
EXPECTED_HASH = "4deb23981d3010c8225a2ff6149e7243dc2268455b299e283afebdd7b72a7d15"
OUT = Path(__file__).resolve().parents[1] / "src/mastra/knowledge-base/ingestion/evaluation/fixtures/dpdpa-2023-review-v1"
OUT.mkdir(parents=True, exist_ok=True)


def exact_part(text, start, end):
    a = text.find(start)
    assert a >= 0, f"Missing start anchor: {start}"
    b = text.find(end, a + len(start)) if end else len(text)
    assert b > a, f"Missing end anchor after {start}: {end}"
    return text[a:b].strip()


def clean_body(page):
    # This PDF prints marginal topic labels beside the Act. This crop follows the
    # main legal column for selected sections; raw whole-page text is also saved.
    return page.crop((115, 105, 485, 785)).extract_text(x_tolerance=1) or ""


def page_fragments(pages, first, last, start, end):
    fragments = []
    for physical_page in range(first, last + 1):
        text = pages[physical_page - 1]
        begin = text.find(start) if physical_page == first else 0
        finish = text.find(end) if physical_page == last and end else len(text)
        assert begin >= 0 and finish > begin, (physical_page, start, end)
        fragments.append({"physical_page": physical_page, "text": text[begin:finish].strip(),
                          "start_in_page": begin, "end_in_page": finish})
    return fragments


def split_subsections(section, number, expected_numbers):
    pattern = rf"(?m)^(?:{number}\. )?\((\d{{1,2}})\) "
    matches = list(re.finditer(pattern, section))
    found = [int(match.group(1)) for match in matches]
    assert found == list(expected_numbers), (number, found)
    return {f"Section {number}({match.group(1)})": section[match.start():
            matches[index + 1].start() if index + 1 < len(matches) else len(section)].strip()
            for index, match in enumerate(matches)}


def split_points(paragraph, section, subsection, letters):
    matches = list(re.finditer(r"(?m)^\(([a-z])\) ", paragraph))
    found = [match.group(1) for match in matches]
    assert found == list(letters), (section, subsection, found)
    return {f"Section {section}({subsection})({match.group(1)})": paragraph[match.start():
            matches[index + 1].start() if index + 1 < len(matches) else len(paragraph)].strip()
            for index, match in enumerate(matches)}


def node(identifier, parent, source_text, kind):
    assert source_text.strip(), identifier
    return {"id": identifier, "parent": parent, "kind": kind,
            "exact_source_text": source_text.strip()}


def edge(source, target, relation, source_words, explanation=None):
    result = {"from": source, "to": target, "relation": relation,
              "source_words": source_words}
    if explanation:
        result["explanation"] = explanation
    return result


def main(pdf_path):
    pdf_bytes = pdf_path.read_bytes()
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    assert pdf_hash == EXPECTED_HASH, "Expected the frozen original Gazette PDF; received different bytes"
    with pdfplumber.open(pdf_path) as document:
        assert len(document.pages) == 21
        raw_pages = [page.extract_text(x_tolerance=1) or "" for page in document.pages]
        body_pages = [clean_body(page) if index < 20 else "" for index, page in enumerate(document.pages)]
        schedule_page = document.pages[20]
        row_tops = [198, 243, 288, 333, 378, 423, 516, 545]
        schedule_rows = []
        for number in range(1, 8):
            top, bottom = row_tops[number - 1] - 1, row_tops[number] - 1
            breach = schedule_page.crop((165, top, 400, bottom)).extract_text(x_tolerance=1).strip()
            penalty = schedule_page.crop((405, top, 485, bottom)).extract_text(x_tolerance=1).strip()
            schedule_rows.append({"row": number, "breach_exact_text": breach,
                                  "penalty_exact_text": penalty, "physical_page": 21})

    body = lambda first, last: "\n".join(body_pages[first - 1:last])
    section_starts = []
    chapter_markers = []
    for physical_page, text in enumerate(body_pages, 1):
        for number, first_line in re.findall(r"(?m)^(\d{1,2})\. ([^\n]+)", text):
            section_starts.append({"section": int(number), "physical_page": physical_page,
                                   "first_line_exact_text": f"{number}. {first_line}"})
        for chapter in re.findall(r"(?m)^CHAPTER [IVX]+$", text):
            chapter_markers.append({"heading_exact_text": chapter, "physical_page": physical_page})
    assert [row["section"] for row in section_starts] == list(range(1, 45))
    assert len(chapter_markers) == 9
    sec8 = exact_part(body(7, 8), "8. (1) A Data Fiduciary", "9. (1) The Data Fiduciary")
    sec9 = exact_part(body(8, 8), "9. (1) The Data Fiduciary", "10. (1) The Central Government")
    sec17 = exact_part(body(11, 12), "17. (1) The provisions", "CHAPTER V")
    sec33 = exact_part(body(16, 17), "33. (1) If the Board", "34. All sums")
    parts8 = split_subsections(sec8, 8, range(1, 12))
    parts9 = split_subsections(sec9, 9, range(1, 6))
    parts17 = split_subsections(sec17, 17, range(1, 6))
    parts33 = split_subsections(sec33, 33, range(1, 3))
    points8 = {}
    for n, letters in [(3, "ab"), (7, "ab"), (8, "ab")]:
        points8.update(split_points(parts8[f"Section 8({n})"], 8, n, letters))
    # A lettered point must not swallow the shared consequence, illustrations,
    # or post-list condition printed after the final point.
    points8["Section 8(3)(b)"] = exact_part(points8["Section 8(3)(b)"], "(b) disclosed", "the Data Fiduciary processing")
    points8["Section 8(7)(b)"] = exact_part(points8["Section 8(7)(b)"], "(b) cause", "Illustrations.")
    points8["Section 8(8)(b)"] = exact_part(points8["Section 8(8)(b)"], "(b) exercise", "for such time period")
    section8_tail = {
        "Section 8(3) shared consequence": exact_part(parts8["Section 8(3)"], "the Data Fiduciary processing", None),
        "Section 8(7) illustrations": exact_part(parts8["Section 8(7)"], "Illustrations.", None),
        "Section 8(8) shared time condition": exact_part(parts8["Section 8(8)"], "for such time period", None),
    }
    points17 = {}
    for n, letters in [(1, "abcdef"), (2, "ab")]:
        points17.update(split_points(parts17[f"Section 17({n})"], 17, n, letters))
    points17["Section 17(1)(f)"] = exact_part(points17["Section 17(1)(f)"], "(f) the processing", "Explanation.—")
    section17_notes = {
        "Section 17(1)(f) explanation": exact_part(parts17["Section 17(1)"], "Explanation.—", "Illustration."),
        "Section 17(1)(f) illustration": exact_part(parts17["Section 17(1)"], "Illustration.", None),
        "Section 17(3) explanation": exact_part(parts17["Section 17(3)"], "Explanation.—", None),
    }
    points33 = split_points(parts33["Section 33(2)"], 33, 2, "abcdefg")

    source_units = {}
    for page_no, text in enumerate(raw_pages, 1):
        source_units[f"page:{page_no}"] = {"comparison_text": text,
                                            "fragments": [{"physical_page": page_no, "text": text}]}

    selected = [
        ("section:8", 7, 8, "8. (1) A Data Fiduciary", "9. (1) The Data Fiduciary", sec8),
        ("section:9", 8, 8, "9. (1) The Data Fiduciary", "10. (1) The Central Government", sec9),
        ("section:17", 11, 12, "17. (1) The provisions", "CHAPTER V", sec17),
        ("section:33", 16, 17, "33. (1) If the Board", "34. All sums", sec33),
    ]
    for key, first, last, start, end, text in selected:
        fragments = page_fragments(body_pages, first, last, start, end)
        source_units[key] = {"comparison_text": text, "fragments": fragments,
                             "source_method": "PDF main-column crop; full raw pages are retained separately"}
    schedule_text = exact_part(raw_pages[20], "THE SCHEDULE", "————")
    source_units["schedule"] = {"comparison_text": schedule_text,
        "fragments": [{"physical_page": 21, "text": schedule_text}],
        "table_rows": schedule_rows}
    first_page = exact_part(raw_pages[0], "THE DIGITAL PERSONAL DATA PROTECTION ACT, 2023", None)
    source_units["section:1"] = {"comparison_text": first_page,
        "fragments": [{"physical_page": 1, "text": first_page}]}
    consent_pages = body_pages[4]
    source_units["clause:6(4)"] = {"comparison_text": exact_part(consent_pages,
        "(4) Where consent given by the Data Principal", "(5) The consequences"),
        "fragments": [{"physical_page": 5, "text": exact_part(body_pages[4],
            "(4) Where consent given by the Data Principal", "(5) The consequences")}]}
    source_units["clause:6(6)"] = {"comparison_text": exact_part(consent_pages,
        "(6) If a Data Principal withdraws", None),
        "fragments": [{"physical_page": 5, "text": exact_part(body_pages[4],
            "(6) If a Data Principal withdraws", None)}]}
    for name, page_no, start, end in [
        ("child", 2, "(f) “child”", "(g) “Consent Manager”"),
        ("fiduciary", 2, "(i) “Data Fiduciary”", "(j) “Data Principal”"),
        ("processor", 2, "(k) “Data Processor”", "(l) “Data Protection Officer”"),
        ("breach", 3, "(u) “personal data breach”", "(v) “prescribed”"),
        ("prescribed", 3, "(v) “prescribed”", "(w) “proceeding”"),
    ]:
        quote = exact_part(raw_pages[page_no - 1], start, end)
        source_units[f"definition:{name}"] = {"comparison_text": quote,
            "fragments": [{"physical_page": page_no, "text": quote}]}
    for n, row in enumerate(schedule_rows, 1):
        source_units[f"schedule:row:{n}"] = {"comparison_text": row["breach_exact_text"] + "\n" + row["penalty_exact_text"],
            "fragments": [{"physical_page": 21, "text": row["breach_exact_text"], "table_column": "breach"},
                          {"physical_page": 21, "text": row["penalty_exact_text"], "table_column": "penalty"}]}

    tree8 = [node("Section 8", "Chapter II", sec8, "section")]
    tree8 += [node(k, "Section 8", v, "subsection") for k, v in parts8.items()]
    tree8 += [node(k, re.sub(r"\([a-z]\)$", "", k), v, "point") for k, v in points8.items()]
    tree8 += [node(k, k.split(" shared")[0].split(" illustrations")[0], v,
                   "illustration" if "illustrations" in k else "shared_text")
              for k, v in section8_tail.items()]
    tree9 = [node("Section 9", "Chapter II", sec9, "section")]
    tree9 += [node(k, "Section 9", v, "subsection") for k, v in parts9.items()]
    tree9 += [node("Section 9(1) explanation", "Section 9(1)",
                   exact_part(parts9["Section 9(1)"], "Explanation.—", None), "explanation")]
    tree17 = [node("Section 17", "Chapter IV", sec17, "section")]
    tree17 += [node(k, "Section 17", v, "subsection") for k, v in parts17.items()]
    tree17 += [node(k, re.sub(r"\([a-z]\)$", "", k), v, "point") for k, v in points17.items()]
    tree17 += [node(k, "Section 17(1)(f)" if k.startswith("Section 17(1)") else "Section 17(3)",
                    v, "explanation" if "explanation" in k else "illustration")
               for k, v in section17_notes.items()]
    tree33 = [node("Section 33", "Chapter VIII", sec33, "section")]
    tree33 += [node(k, "Section 33", v, "subsection") for k, v in parts33.items()]
    tree33 += [node(k, "Section 33(2)", v, "point") for k, v in points33.items()]

    refs8 = [
        edge("Section 8(8)", "Section 8(7)(a)", "explicit_reference", "clause (a) of sub-section (7)"),
        edge("Section 8(11)", "Section 8", "explicit_relative_reference", "this section"),
        edge("Section 8(5)", "Section 2(u)", "defined_term", "personal data breach",
             "The term is defined in section 2(u); this is a term-use link, not a printed citation."),
        edge("Section 8(6)", "Section 2(u)", "defined_term", "personal data breach",
             "The term is defined in section 2(u); this is a term-use link, not a printed citation."),
    ]
    refs9 = [
        edge("Section 9(1)", "Section 2(f)", "defined_term", "child",
             "The child definition appears in section 2(f); the section does not cite it by number."),
        *[edge(f"Section 9({n})", f"Section 9({t})", "explicit_reference", "sub-sections (1) and (3)")
          for n in (4, 5) for t in (1, 3)],
        edge("Schedule row 3", "Section 9", "explicit_reference", "section 9"),
    ]
    refs17 = [
        edge("Section 17(1)", "Chapter II", "conditional_exemption", "Chapter II"),
        edge("Section 17(1)", "Chapter III", "conditional_exemption", "Chapter III"),
        edge("Section 17(1)", "Section 16", "conditional_exemption", "section 16"),
        edge("Section 17(1)", "Section 8(1)", "exception_to_exemption", "sub-sections (1) and (5) of section 8"),
        edge("Section 17(1)", "Section 8(5)", "exception_to_exemption", "sub-sections (1) and (5) of section 8"),
        *[edge("Section 17(3)", target, "notification_dependent_exemption", words)
          for target, words in [("Section 5", "section 5"), ("Section 8(3)", "sub-sections (3) and (7) of"),
                                ("Section 8(7)", "sub-sections (3) and (7) of"),
                                ("Section 10", "sections 10 and 11"), ("Section 11", "sections 10 and 11")]],
        edge("Section 17(4)", "Section 8(7)", "conditional_exemption", "sub-section (7) of section 8"),
        edge("Section 17(4)", "Section 12(3)", "conditional_exemption", "sub-section (3) of section 12"),
        edge("Section 17(4)", "Section 12(2)", "conditional_exemption", "sub-section (2) of section 12"),
        edge("Section 17(1)(f) explanation", "Insolvency and Bankruptcy Code 2016 Section 3(12)",
             "external_defined_term_reference", "sub-sections (12) and (14) of section 3"),
        edge("Section 17(1)(f) explanation", "Insolvency and Bankruptcy Code 2016 Section 3(14)",
             "external_defined_term_reference", "sub-sections (12) and (14) of section 3"),
    ]
    refs33 = [edge("Section 33(1)", "The Schedule", "explicit_reference", "Schedule"),
              edge("Section 33(2)", "Section 33(1)", "explicit_relative_reference", "sub-section (1)")]
    schedule_refs = [
        edge("Schedule row 1", "Section 8(5)", "explicit_reference", "sub-section (5) of section 8"),
        edge("Schedule row 2", "Section 8(6)", "explicit_reference", "sub-section (6) of section 8"),
        edge("Schedule row 3", "Section 9", "explicit_reference", "section 9"),
        edge("Schedule row 4", "Section 10", "explicit_reference", "section 10"),
        edge("Schedule row 5", "Section 15", "explicit_reference", "section 15"),
        edge("Schedule row 6", "Section 32", "explicit_reference", "section 32"),
        edge("Schedule row 6", "Section 28", "explicit_procedural_reference", "section 28",
             "This citation is in the penalty cell and concerns the proceedings, not the breached obligation."),
    ]

    source = {"sha256": pdf_hash, "byte_size": len(pdf_bytes), "page_count": 21,
              "filename": pdf_path.name, "local_path": str(pdf_path),
              "source_type": "original 11 August 2023 Gazette publication of Act 22 of 2023",
              "edition_note": "This PDF alone does not establish commencement of each provision or later Rules/amendments.",
              "official_reference_url": "https://www.meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf"}
    grading = {"method": "source_backed_comparison",
        "match_policy": "Check every named expected node, source text, condition and edge separately. Match legal wording after harmless PDF line-wrap normalization; retain negations, AND/OR, numbers, actors, exceptions and modality. Return missing, wrong, unsupported or uncertain items with source evidence. Internal IDs may differ.",
        "outcomes": ["pass", "fail", "not_run", "blocked_by_upstream", "needs_review"],
        "can_be_release_gate_now": False}
    cases = []

    def add(stage, number, title, refs, pages, expected, must_not, *, scope="source_native",
            challenge="structure_and_relations", input_task=None, basis="source_facts"):
        for ref in refs:
            assert ref in source_units, (stage, number, ref)
        cases.append({"id": f"DPDPA-{stage}-{number:02d}", "stage": stage,
            "title": title, "scope": scope, "challenge_type": challenge,
            "split": "development", "severity": "critical", "source_refs": refs,
            "physical_pages": pages,
            "input": {"mode": "inspect_frozen_ingestion_run", "task": input_task or title,
                      "source_boundary": "The ingestion model receives only the PDF and its workflow instructions; it never receives expected results, forbidden results, or review notes."},
            "expected": expected, "must_not": must_not, "grading": dict(grading),
            "expectation_basis": basis,
            "evaluation_scope": "Only this complete selected source passage and the named dependent passages are scored; passing does not certify the whole Act.",
            "human_review": {"status": "pending", "reviewer": None, "reviewed_at": None, "notes": ""}})

    add("S1", 1, "Identify this exact Gazette Act and its commencement limitation",
        ["page:1", "section:1"], [1],
        {"document_identity": {"act_number": "22 of 2023", "title": "The Digital Personal Data Protection Act, 2023",
                               "publication_date_on_pdf": "11 August 2023", "pdf_sha256": pdf_hash},
         "exact_commencement_text": exact_part(first_page, "(2) It shall come into force", None),
         "commencement_status_from_this_pdf": "Different provisions may commence on different notified dates; this PDF does not contain those notifications."},
        ["Claiming every provision commenced on 11 August 2023.", "Treating this source as the 2025 Rules or as a current consolidated edition."],
        challenge="source_identity")
    add("S1", 2, "Account for all physical pages and classify the Schedule separately",
        ["page:1", "page:21", "schedule"], [1, 21],
        {"physical_page_inventory": list(range(1, 22)),
         "schedule_heading_exact_text": "THE SCHEDULE\n[See section 33 (1)]",
         "schedule_type": "penalty table referenced by section 33(1), not seven numbered Act sections",
         "page_1_matter": "Gazette metadata, Act title and beginning of Chapter I; the Gazette masthead is not an operative obligation."},
        ["Dropping page 21 as footer material.", "Treating Schedule rows 1–7 as Sections 1–7."],
        challenge="document_classification")
    add("S2", 1, "Reconstruct the complete Section 8(7) across pages 7–8",
        ["section:8", "page:7", "page:8"], [7, 8],
        {"exact_subsection_text": parts8["Section 8(7)"],
         "point_a_exact_text": points8["Section 8(7)(a)"],
         "point_b_exact_text": points8["Section 8(7)(b)"],
         "boundary": "Begins on page 7 and continues on page 8; ends immediately before Section 8(8).",
         "condition": "The opening exception for retention necessary to comply with law governs both (a) and (b)."},
        ["Stopping point (a) at the page break.", "Attaching the page-8 continuation to a new section.",
         "Dropping point (b) or the opening retention exception."], challenge="cross_page_boundary")
    add("S2", 2, "Reconstruct Section 33(1) across pages 16–17",
        ["section:33", "page:16", "page:17"], [16, 17],
        {"exact_subsection_text": parts33["Section 33(1)"],
         "boundary": "The phrase beginning 'person an opportunity of being heard' continues Section 33(1) on page 17.",
         "required_facts": ["Board concludes an inquiry", "significant breach", "opportunity of being heard",
                            "may impose a monetary penalty specified in the Schedule"]},
        ["Ending the sentence at the page-16 footer.", "Treating the page-17 continuation as Section 33(2)."],
        challenge="cross_page_boundary")
    add("S2", 3, "Extract all seven Schedule rows with their own penalty cells",
        ["schedule"] + [f"schedule:row:{n}" for n in range(1, 8)], [21],
        {"table_heading_exact_text": "THE SCHEDULE\n[See section 33 (1)]",
         "column_headers": ["Sl. No.", "Breach of provisions of this Act or rules made thereunder", "Penalty"],
         "rows": schedule_rows, "row_count": 7},
        ["Pairing a breach description with the following row's penalty.",
         "Interpreting 'May extend to' as a fixed automatic penalty.",
         "Inventing a fixed amount for Schedule row 6."], challenge="table_structure")
    add("S2", 4, "Locate all 44 Act sections and nine chapter starts without dropping the Schedule",
        [f"page:{n}" for n in range(1, 22)], list(range(1, 22)),
        {"section_starts": section_starts, "chapter_markers": chapter_markers,
         "act_section_count": 44, "chapter_count": 9,
         "schedule_presence": {"physical_page": 21, "heading_exact_text": "THE SCHEDULE"}},
        ["Missing a section whose number and start line are printed in the PDF.",
         "Treating Schedule rows as Sections 45–51.",
         "Using the printed Gazette page number as the physical PDF page number."],
        challenge="full_document_map_inventory")
    add("S3", 1, "Build the complete Section 8 tree and local reference graph",
        ["section:8", "definition:breach", "page:7", "page:8"], [7, 8],
        {"reference_tree": {"nodes": tree8}, "reference_edges": refs8,
         "inherited_conditions": [
             {"children": ["Section 8(3)(a)", "Section 8(3)(b)"],
              "parent_text": exact_part(parts8["Section 8(3)"], "(3) Where", "(a) used")},
             {"children": ["Section 8(7)(a)", "Section 8(7)(b)"],
              "parent_text": exact_part(parts8["Section 8(7)"], "(7) A Data Fiduciary", "(a) erase")},
         ], "paragraph_count": 11, "lettered_points": sorted(points8)},
        ["Eleven unrelated rules without Section 8 parent context.",
         "Treating a defined-term link as a printed section citation.",
         "Attaching the page-8 continuation of Section 8(7)(a) to Section 8(8)."],
        challenge="complete_subgraph")
    add("S3", 2, "Connect Section 33(1), the Schedule and each referenced obligation",
        ["section:33", "schedule"] + [f"schedule:row:{n}" for n in range(1, 8)] +
        ["section:8", "section:9"], [7, 8, 16, 17, 21],
        {"reference_tree": {"nodes": tree33 + [node("The Schedule", "Act", schedule_text, "schedule")] +
                              [node(f"Schedule row {row['row']}", "The Schedule",
                                    row["breach_exact_text"] + "\n" + row["penalty_exact_text"], "table_row")
                               for row in schedule_rows]},
         "reference_edges": refs33 + schedule_refs,
         "multi_hop_paths": [
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 1", "Section 8(5)"],
              "relation_sequence": ["explicit_reference", "contains", "explicit_reference"],
              "meaning": "Security safeguard breach category; possible penalty up to 250 crore rupees, subject to Section 33 conditions."},
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 2", "Section 8(6)"],
              "relation_sequence": ["explicit_reference", "contains", "explicit_reference"],
              "meaning": "Breach-intimation category; possible penalty up to 200 crore rupees, subject to Section 33 conditions."},
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 3", "Section 9"],
              "relation_sequence": ["explicit_reference", "contains", "explicit_reference"],
              "meaning": "Children's obligations category; possible penalty up to 200 crore rupees, subject to Section 33 conditions."},
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 4", "Section 10"],
              "relation_sequence": ["explicit_reference", "contains", "explicit_reference"],
              "meaning": "Significant Data Fiduciary category; possible penalty up to 150 crore rupees, subject to Section 33 conditions."},
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 5", "Section 15"],
              "relation_sequence": ["explicit_reference", "contains", "explicit_reference"],
              "meaning": "Data Principal duty category; possible penalty up to ten thousand rupees, subject to Section 33 conditions."},
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 6", "Section 32"],
              "relation_sequence": ["explicit_reference", "contains", "explicit_reference"],
              "meaning": "Voluntary-undertaking breach category; cap depends on the underlying breach for which Section 28 proceedings were instituted."},
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 6", "Section 28"],
              "relation_sequence": ["explicit_reference", "contains", "explicit_procedural_reference"],
              "meaning": "Section 28 is referenced by the row's penalty cell as proceedings context, not as the breached duty."},
             {"path": ["Section 33(1)", "The Schedule", "Schedule row 7"],
              "relation_sequence": ["explicit_reference", "contains"],
              "meaning": "Residual breach category; possible penalty up to 50 crore rupees, subject to Section 33 conditions."},
         ]},
        ["Inventing a direct printed citation from Section 8(5) to the Schedule.",
         "Calling a Schedule ceiling an automatically imposed penalty.",
         "Conflating Schedule row 1 security and row 2 breach notice."], challenge="multi_hop_graph")
    add("S3", 3, "Model Section 17 exemptions and their retained duties",
        ["section:17", "section:8", "page:11", "page:12"], [7, 8, 11, 12],
        {"reference_tree": {"nodes": tree17}, "reference_edges": refs17,
         "exemption_scope": {"section_17_1": "In the listed situations, Chapter II except Section 8(1) and 8(5), Chapter III and Section 16 are excluded.",
                             "section_17_3": "Only notified Data Fiduciaries or classes receive the listed exemptions; notification is a condition, not a fact established by this Act."}},
        ["Exempting Section 8(1) or 8(5) through Section 17(1).",
         "Applying Section 17(3) to all startups without a notification.",
         "Treating the different Section 17 subsections as one blanket exemption."],
        challenge="exception_scope")
    add("S3", 4, "Model Section 9 child duties, definition and exceptions",
        ["section:9", "definition:child", "schedule:row:3"], [2, 8, 21],
        {"reference_tree": {"nodes": tree9}, "reference_edges": refs9,
         "definition_exact_text": source_units["definition:child"]["comparison_text"],
         "schedule_row_3": schedule_rows[2],
         "exception_scope": "Sections 9(4) and 9(5) concern duties in 9(1) and 9(3); neither says Section 9(2) disappears."},
        ["Treating Section 9(4) as exempting the harm restriction in Section 9(2).",
         "Treating an unissued class/purpose notification as already applicable."],
        challenge="definitions_and_exception_scope")
    add("S4", 1, "Interpret Section 8(7) erasure and Section 8(8) timing faithfully",
        ["section:8", "clause:6(4)", "clause:6(6)"], [5, 7, 8],
        {"source_text": [parts8["Section 8(7)"], parts8["Section 8(8)"],
                         source_units["clause:6(4)"]["comparison_text"],
                         source_units["clause:6(6)"]["comparison_text"]],
         "actor": "Data Fiduciary", "trigger": "Consent withdrawal or reasonable assumption specified purpose no longer served, whichever earlier.",
         "condition": "Retention necessary to comply with law is an exception.",
         "duties": ["Erase applicable personal data", "Cause Data Processor to erase data made available to it for processing"],
         "section_8_8": "Deemed purpose-completion period is to be prescribed; the Act PDF states no numeric period.",
         "relationship_to_section_6": "Section 6(4) allows withdrawal; Section 6(6) separately requires cessation within a reasonable time subject to its legal exceptions."},
        ["Inventing a fixed retention period from this Act PDF.",
         "Ignoring the legal-retention exception.", "Calling erasure and cessation identical duties."],
        challenge="legal_meaning")
    add("S4", 2, "Interpret Section 17(1) without losing Section 8(1) and 8(5)",
        ["section:17", "section:8"], [7, 11, 12],
        {"source_text": parts17["Section 17(1)"],
         "conditional_scope": "Only the situations listed in 17(1)(a)–(f) qualify.",
         "removed_within_scope": ["Chapter II except Section 8(1) and 8(5)", "Chapter III", "Section 16"],
         "retained": ["Section 8(1)", "Section 8(5)"],
         "subsection_3_dependency": "Separate exemption under 17(3) requires a Central Government notification."},
        ["Saying all Section 8 duties disappear under 17(1).",
         "Combining 17(1) and 17(3) into one unconditional exemption."],
        challenge="legal_meaning")
    add("S4", 3, "Interpret significant breach penalties without inventing automatic amounts",
        ["section:33", "schedule", "schedule:row:1", "schedule:row:2"], [16, 17, 21],
        {"source_text": [parts33["Section 33(1)"], parts33["Section 33(2)"],
                         source_units["schedule:row:1"]["comparison_text"],
                         source_units["schedule:row:2"]["comparison_text"]],
         "conditions": ["Board concludes inquiry", "breach is significant", "opportunity of being heard"],
         "modality": "Board may impose a monetary penalty; Schedule values are maxima for the listed breach categories.",
         "determination_factors": [f"Section 33(2)({letter})" for letter in "abcdefg"],
         "row_1_ceiling": "250 crore rupees", "row_2_ceiling": "200 crore rupees"},
        ["Automatic fine whenever a breach occurs.",
         "Confusing row 1 and row 2 ceilings.", "Omitting the hearing or significant-breach condition."],
        challenge="legal_meaning")
    add("S5", 1, "Generate source-backed analysis guidance for security and breach",
        ["section:8", "section:33", "schedule:row:1", "schedule:row:2", "definition:breach"],
        [3, 7, 16, 17, 21],
        {"legal_source": [parts8["Section 8(5)"], parts8["Section 8(6)"],
                          parts33["Section 33(1)"], schedule_rows[0], schedule_rows[1]],
         "analysis_checks": [
             {"rule": "Section 8(5)", "question": "What safeguards protected data held or controlled by the fiduciary, including processing by its processor?", "proof_examples": ["security policy", "control records", "incident prevention evidence"]},
             {"rule": "Section 8(6)", "question": "Was the Board and each affected Data Principal informed of a personal data breach in the prescribed form and manner?", "proof_examples": ["incident record", "notice to Board", "affected-principal notices"]}],
         "unknown_from_act_alone": "A specific notification hour or prescribed form cannot be concluded from this Act PDF alone; look up the applicable rules/version."},
        ["Demanding a 72-hour deadline from this Act PDF.",
         "Treating an example proof document as a statutory form required by the Act."],
        scope="source_plus_authored_guidance", basis="source_facts_and_authored_product_rubric",
        challenge="generated_analysis_guidance")
    add("S5", 2, "Generate drafting guidance for processor contract without inventing statutory terms",
        ["section:8", "definition:processor"], [2, 7],
        {"legal_source": [parts8["Section 8(1)"], parts8["Section 8(2)"],
                          source_units["definition:processor"]["comparison_text"]],
         "mandatory_from_act": "Processing on behalf of a Data Fiduciary for the stated activity involves a Data Processor only under a valid contract; the fiduciary remains responsible under Section 8(1).",
         "drafting_guidance": ["Define fiduciary and processor roles", "Identify the processing activity",
                               "Address security and breach cooperation as risk-based drafting recommendations"],
         "preference_label": "Terms beyond the Act's stated contract requirement must be labelled drafting recommendations or sourced to another instrument."},
        ["Presenting a GDPR Article 28-style list as mandatory wording of this Act.",
         "Claiming a contract removes the Data Fiduciary's Section 8(1) responsibility."],
        scope="source_plus_authored_guidance", basis="source_facts_and_authored_product_rubric",
        challenge="generated_drafting_guidance")
    add("S6", 1, "Retrieve complete security-breach and penalty context",
        ["section:8", "section:33", "schedule:row:1", "schedule:row:2", "definition:breach"],
        [3, 7, 16, 17, 21],
        {"query": "What are a Data Fiduciary's security and breach-notice duties and the possible penalties?",
         "direct_retrieval": {"required_source_passages": ["Section 8(5)", "Section 8(6)", "Section 33(1)", "Schedule row 1", "Schedule row 2"],
                              "match_by": "actual returned passage coverage, not chunk IDs"},
         "context_expansion": ["definition of personal data breach in Section 2(u)",
                               "Section 33(2) factors for determining amount"],
         "source_text": [parts8["Section 8(5)"], parts8["Section 8(6)"],
                         parts33["Section 33(1)"], schedule_rows[0], schedule_rows[1]]},
        ["Returning Schedule row 7 alone as if it were the specific security penalty.",
         "Reporting a direct Section 8(5) to Schedule citation that is absent from source."],
        scope="source_plus_authored_query", basis="source_facts_and_authored_query",
        challenge="retrieval_and_context")
    add("S6", 2, "Keep source edition and commencement status visible in retrieval",
        ["section:1", "page:1"], [1],
        {"query": "As of today, are all DPDPA duties in force?",
         "source_identity": pdf_hash,
         "this_pdf_supports": "Section 1(2) permits different notified commencement dates for different provisions.",
         "this_pdf_does_not_supply": "The later notifications or consolidated current commencement status.",
         "retrieval_action": "Locate the applicable official commencement notifications or return that current status cannot be established from this PDF alone."},
        ["Answering that every duty commenced when this Gazette Act was published.",
         "Silently using model memory without identifying an external versioned source."],
        scope="source_plus_authored_query", basis="source_facts_and_authored_query",
        challenge="source_version_retrieval")
    add("S7", 1, "Answer a breach deadline question with the correct source limit",
        ["section:8", "section:33", "schedule:row:2"], [7, 16, 17, 21],
        {"user_question": "The Act PDF is uploaded. Within how many hours must we notify a breach?",
         "answer_requirements": ["Cite Section 8(6)", "State that this Act requires notice to the Board and each affected Data Principal in the prescribed form and manner",
                                  "State that this Act PDF itself gives no hour count", "Check applicable rules and commencement/version before giving a current deadline"],
         "supporting_exact_text": parts8["Section 8(6)"],
         "answer_status": "Needs an additional current legal source for a current numeric deadline."},
        ["Inventing a 72-hour deadline from this Act PDF.",
         "Claiming no deadline exists anywhere in Indian law merely because this PDF has no hour count."],
        scope="source_plus_authored_question", basis="source_facts_and_authored_question",
        challenge="legal_qa")
    add("S7", 2, "Analyse a processor contract without losing fiduciary responsibility",
        ["section:8", "definition:processor"], [2, 7],
        {"scenario": "A Data Fiduciary uses a processor. A contract exists, but the review has no evidence of safeguards or breach cooperation.",
         "required_conclusion": ["Check whether the contract is valid for Section 8(2)",
                                 "Keep fiduciary responsibility under Section 8(1)",
                                 "Treat compliance with Section 8(5) and 8(6) as unproven from this limited record"],
         "supporting_exact_text": [parts8["Section 8(1)"], parts8["Section 8(2)"],
                                    parts8["Section 8(5)"], parts8["Section 8(6)"]]},
        ["Concluding the processor contract transfers all statutory responsibility.",
         "Calling absence of supplied evidence proof of a real-world breach."],
        scope="source_plus_authored_scenario", basis="source_facts_and_authored_scenario",
        challenge="analysis_use")

    dataset = {"schema_version": "dpdpa-review-dataset/1.0",
        "dataset_id": "dpdpa-gazette-2023-en-review-v1", "source_family": "DPDPA-Act-22-of-2023",
        "status": "draft_for_human_review", "split": "development", "source": source,
        "stages": {"S1": "Source identity and classification", "S2": "Text extraction and complete boundaries",
                   "S3": "Document tree and relationships", "S4": "Legal meaning",
                   "S5": "Generated module guidance", "S6": "Retrieval and publication",
                   "S7": "Use in analysis, drafting and Q&A"},
        "coverage_policy": "Selected passages are complete within their stated scope. This development set does not certify all 44 sections or current law.",
        "cases": cases}
    source_text_by_id = {item["id"]: item["exact_source_text"]
                         for tree in (tree8, tree9, tree17, tree33)
                         for item in tree}
    source_text_by_id.update({f"Schedule row {row['row']}": row["breach_exact_text"] + "\n" + row["penalty_exact_text"]
                              for row in schedule_rows})
    anchors_checked = 0
    for case in cases:
        for ref in case["source_refs"]:
            assert ref in source_units, (case["id"], ref)
        tree = case["expected"].get("reference_tree", {})
        nodes = tree.get("nodes", [])
        scoped_source = "\n".join(source_units[ref]["comparison_text"] for ref in case["source_refs"])
        for item in nodes:
            if item["kind"] == "table_row":
                continue  # Breach and penalty are separate printed table cells.
            assert item["exact_source_text"] in scoped_source, (case["id"], item["id"])
        for item in case["expected"].get("reference_edges", []):
            origin = source_text_by_id.get(item["from"])
            assert origin is not None, (case["id"], item["from"])
            assert item["source_words"] in origin, (case["id"], item)
            anchors_checked += 1
    assert len(schedule_rows) == 7 and all(row["breach_exact_text"] and row["penalty_exact_text"]
                                           for row in schedule_rows)
    assert "CHAPTER V" not in sec17 and "THE GAZETTE" not in sec8 + sec9 + sec17 + sec33
    assert source_units["clause:6(6)"]["comparison_text"].endswith("for the time being in force in India.")
    validation = {"status": "automatic_source_checks_passed_human_review_pending",
                  "meaning": "The extracted selected passages and graph-edge anchors are present in this PDF. This does not prove legal interpretation or whole-Act completeness.",
                  "pdf_sha256": pdf_hash, "case_count": len(cases),
                  "all_source_refs_resolved": True, "graph_nodes_checked": sum(
                      len(case["expected"].get("reference_tree", {}).get("nodes", [])) for case in cases),
                  "graph_edge_source_anchors_checked": anchors_checked,
                  "act_section_starts_located": len(section_starts),
                  "chapter_starts_located": len(chapter_markers),
                  "schedule_rows_cell_checked": len(schedule_rows),
                  "cross_page_sections": ["Section 8(7): physical pages 7–8", "Section 33(1): physical pages 16–17"]}
    run = {"dataset_id": dataset["dataset_id"], "source_sha256": pdf_hash,
        "run_id": None, "provider": None, "model": None, "prompt_version": None,
        "pipeline_version": None, "reasoning_setting": None, "model_assignments": [],
        "artifacts": {}, "results": [{"case_id": case["id"], "status": "not_run", "observed": None,
             "evidence_refs": [], "failed_expected_fields": [], "forbidden_claims_found": [],
             "reviewer_notes": ""} for case in cases]}
    pack = {"source_sha256": pdf_hash, "units": source_units}
    for name, data in [("dataset.json", dataset), ("source-passages.json", pack),
                       ("run-results.template.json", run),
                       ("validation-report.json", validation),
                       ("pages.json", [{"physical_page": i, "text": text} for i, text in enumerate(raw_pages, 1)])]:
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    entries = []
    for case in cases:
        expected = html.escape(json.dumps(case["expected"], ensure_ascii=False, indent=2))
        refs = "".join(f"<details><summary>{html.escape(ref)}</summary><pre>{html.escape(source_units[ref]['comparison_text'])}</pre></details>"
                       for ref in case["source_refs"])
        entries.append(f"<article id='{case['id']}'><small>{case['id']} · {case['stage']} · HUMAN REVIEW PENDING</small>"
                       f"<h2>{html.escape(case['title'])}</h2><p>{html.escape(case['evaluation_scope'])}</p>"
                       f"<details><summary>Exact expected output and checks</summary><pre>{expected}</pre></details>"
                       f"<details><summary>Forbidden mistakes</summary><pre>{html.escape(json.dumps(case['must_not'], indent=2))}</pre></details>"
                       f"<details><summary>Original PDF excerpts</summary>{refs}</details></article>")
    page = "<!doctype html><meta charset='utf-8'><title>DPDPA source-backed review</title>" + \
        "<style>body{font:16px/1.5 system-ui;background:#f3f6f9;color:#162d3b;margin:auto;max-width:1050px;padding:30px}" + \
        "article,header{background:#fff;border:1px solid #d9e2ea;border-radius:10px;padding:22px;margin:18px 0}" + \
        "pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fa;padding:14px;font:13px/1.5 ui-monospace,monospace}" + \
        "summary{cursor:pointer;color:#155575;font-weight:650;padding:8px}small{color:#586b78}h2{margin:8px 0}</style>" + \
        f"<header><h1>DPDP Act evaluation draft</h1><p>{len(cases)} detailed cases · 21-page original Gazette PDF · all human review pending</p>" + \
        "<p>Open a case to inspect its exact expected text, graph, forbidden errors and PDF source excerpts. " + \
        "The source is the 2023 Act PDF; later commencement notifications and Rules are outside this file. " + \
        "No ingestion run has been scored.</p><p><a href='dataset.json'>Dataset JSON</a> · " + \
        "<a href='source-passages.json'>Source passages</a> · <a href='run-results.template.json'>Run template</a></p></header>" + \
        "".join(entries)
    (OUT / "review.html").write_text(page, encoding="utf-8")
    print(json.dumps({"cases": len(cases), "pages": len(raw_pages), "sha256": pdf_hash,
                      "out": str(OUT), "s3_nodes": [len(tree8), len(tree9), len(tree17), len(tree33)]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=PDF,
                        help="Path to the exact frozen DPDPA Gazette PDF (SHA-256 checked)")
    main(parser.parse_args().pdf)
