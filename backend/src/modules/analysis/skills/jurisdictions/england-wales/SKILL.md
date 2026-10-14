# England and Wales jurisdiction skill (draft)

## Coverage
Deepened from the drafting `england` pack. Aliases `england` and `uk` resolve here; do not create `jurisdictions/england`. Scotland and Northern Ireland have separate execution regimes — do not default a 'UK' instruction to England and Wales without confirming.

## clause:governing_law
Choice of law and/or forum.

## clause:non_compete
Post-termination non-compete / restrictive covenant.

## clause:execution_formalities
Signing, witnessing, deed, or company-seal formalities.

## clause:electronic_signature
Electronic signature validity and any required prior consent to transact electronically.

## rule:ew.simple_contract_or_deed
Classify the document as a simple contract or a deed before choosing the execution block. Name England and Wales, not UK, in the governing-law clause unless another UK jurisdiction is confirmed.

## rule:ew.companies_act_s44
Company deeds: two directors, a director and secretary, or one director in the presence of a witness (Companies Act 2006 s.44).

## rule:ew.physical_witnessing
A deed witness must be physically present with the signatory. Do not rely on remote or video witnessing.

## risk:ew_execution_classification_gap
Execution formalities do not distinguish a simple contract from a deed, or governing law says 'UK' without confirming England and Wales.

## risk:ew_s44_execution_gap
A company deed is not executed by two directors, a director and secretary, or one director plus a witness.

## risk:ew_remote_witness_gap
A deed relies on remote or video witnessing rather than physical presence.

## risk:other_known_risk
Other material contractual risk.
