-- Keep the persisted relation vocabulary aligned with source-grounded discovery.
ALTER TABLE kb_legal_relation_revisions DROP CONSTRAINT kb_legal_relation_revisions_kind_check;
ALTER TABLE kb_legal_relation_revisions ADD CONSTRAINT kb_legal_relation_revisions_kind_check CHECK (
  kind IN ('refers_to', 'defines', 'exempts_from', 'exception_to', 'depends_on',
    'alternative_to', 'interprets', 'penalty_for', 'defined_term')
);
ALTER TABLE kb_legal_relation_revisions ADD COLUMN condition_text TEXT;
