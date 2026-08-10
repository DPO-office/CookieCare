# DPA — Data Processing Agreement skill

## Purpose
Rules for drafting a controller–processor Data Processing Agreement (DPA / DPA addendum).

## Required facts before drafting
- **Governing law** must be known. If missing or "not specified", ask which governing law / jurisdiction applies (e.g. Ireland, England and Wales, Delaware, California). This changes courts language and which regime packs apply.
- **Parties** (controller and processor) must be identified. If neither parties[] nor partyA is set, ask who the controller and processor are — party names appear throughout the DPA.
- Where personal data is transferred outside the EEA (`dataTransfer` indicates EEA→non-EEA), the DPA must specify the **transfer mechanism** (e.g. Standard Contractual Clauses, adequacy, UK IDTA). If SCCs are used, identify the applicable **SCC module**. If transfer is EEA_to_nonEEA and transferMechanism/sccModule is unset, ask which mechanism and, for SCCs, which module — the transfer clause cites a specific mechanism/module and drafting the wrong one misstates the parties' data-transfer relationship.

## Mandatory drafting requirements
- The DPA must specify the **subject matter and duration of processing**.
- The DPA must describe **appropriate technical and organisational security measures**.
- **Sub-processor engagement and flow-down obligations** must be addressed (authorization, notice, equivalent obligations).
- **Personal data breach notification** obligations must be present (timelines and content of notice to the controller).
- **Return or deletion of personal data** at the end of services must be specified.
- A **processing details exhibit** (categories of data subjects, data types, processing operations) should be present.

## Section mapping hints
- Processing subject matter / duration → sec-processing
- Security measures → sec-security
- Sub-processors → sec-subprocessors
- International transfers / SCC module → sec-transfers
- Breach notification → sec-breach
- Return/deletion → sec-return
- Processing details exhibit → exhibit-processing
