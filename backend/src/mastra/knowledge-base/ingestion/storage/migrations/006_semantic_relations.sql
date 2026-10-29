-- Additive relation vocabulary. Existing immutable revisions and review hashes are unchanged.
ALTER TABLE kb_provisions DROP CONSTRAINT kb_provisions_kind_check;
ALTER TABLE kb_provisions ADD CONSTRAINT kb_provisions_kind_check CHECK (
  kind IN ('article', 'paragraph', 'point', 'table', 'footnote', 'annex', 'definition',
    'rule', 'schedule', 'recital', 'chapter', 'section', 'illustration', 'unknown',
    'subsection', 'subparagraph', 'list_item', 'table_row', 'part', 'title')
);

ALTER TABLE kb_legal_relation_revisions DROP CONSTRAINT kb_legal_relation_revisions_kind_check;
ALTER TABLE kb_legal_relation_revisions ADD CONSTRAINT kb_legal_relation_revisions_kind_check CHECK (
  kind IN ('refers_to', 'defines', 'exempts_from', 'exception_to', 'depends_on',
    'alternative_to', 'interprets', 'penalty_for')
);
ALTER TABLE kb_legal_relation_revisions ADD COLUMN role TEXT;
ALTER TABLE kb_legal_relation_revisions ADD COLUMN ontology_version TEXT;
