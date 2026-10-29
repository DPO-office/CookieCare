import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  run: { type: "string" }, "evaluation-report": { type: "string" },
  "dry-run": { type: "boolean", default: false },
} });
const runDir = path.resolve(values.run ?? positionals[0] ?? "");
if (!values.run && !positionals[0]) throw new Error("Use --run <ingestion run directory>");
const runId = path.basename(runDir);
const read = async (name: string) => JSON.parse(await readFile(path.join(runDir, name), "utf8"));
const [draft, document, semantic, evaluation, evaluationInput] = await Promise.all([
  read("reconstruction.json"), read("document-model.json"),
  read("semantic-relationships.json").catch(() => null),
  values["evaluation-report"] ? JSON.parse(await readFile(path.resolve(values["evaluation-report"]), "utf8"))
    : null,
  read("evaluation-input.json").catch(() => null),
]);
if (!Array.isArray(draft.provisions) || !Array.isArray(draft.relationships) ||
  draft.textHash !== document.textHash) throw new Error("Run graph artifacts are missing or inconsistent");
const nodeIds = new Set(draft.provisions.map((provision: { id: string }) => provision.id));
const uid = (id: string) => `${runId}:${id}`;
const nodes = draft.provisions.map((provision: Record<string, any>) => ({
  id: uid(provision.id), provisionId: provision.id, runId,
  sourceVersionId: draft.sourceVersionId, label: provision.canonicalCitation ?? provision.label ?? provision.kind,
  kind: provision.kind, text: provision.text, page: provision.sourceSpans?.[0]?.physicalPage ?? null,
  start: provision.start, end: provision.end, reviewStatus: provision.status,
  parentId: provision.parentId ? uid(provision.parentId) : null,
}));
const resolved: Record<string, unknown>[] = [], candidates: Record<string, unknown>[] = [];
const unresolved: Record<string, unknown>[] = [];
for (const relation of draft.relationships as Record<string, any>[]) {
  if (!relation.sourceProvisionId || !nodeIds.has(relation.sourceProvisionId)) continue;
  const shared = { id: uid(relation.id), sourceId: uid(relation.sourceProvisionId),
    relationId: relation.id, mention: relation.exactMention, status: relation.status,
    type: relation.relationType, role: relation.semanticRole ?? null };
  const targetIds = [...new Set(relation.targetProvisionIds ?? [])].filter(id => nodeIds.has(id));
  if (relation.status === "proposed" && targetIds.length === 1) {
    resolved.push({ ...shared, targetId: uid(targetIds[0]) });
  } else if (targetIds.length) {
    targetIds.forEach(targetId => candidates.push({ ...shared, targetId: uid(targetId),
      id: `${uid(relation.id)}:${targetId}` }));
  } else unresolved.push({ ...shared, targetHint: relation.targetHint ?? relation.exactMention,
    external: relation.externalTarget?.instrumentHint ?? null });
}
const semanticLinks = (semantic?.links ?? []).filter((link: Record<string, any>) =>
  nodeIds.has(link.sourceProvisionId) && nodeIds.has(link.targetProvisionId))
  .map((link: Record<string, any>) => ({ id: uid(link.id), sourceId: uid(link.sourceProvisionId),
    targetId: uid(link.targetProvisionId), kind: link.kind, role: link.role,
    evidence: link.evidenceQuote, evidenceStart: link.evidenceStart, evidenceEnd: link.evidenceEnd,
    status: link.status }));
const cases = (evaluation?.cases ?? []).map((item: Record<string, any>) => ({
  id: uid(item.caseId), caseId: item.caseId, stage: item.stage, status: item.status,
  reviewStatus: item.reviewStatus ?? "pending", reasons: (item.reasons ?? []).join("\n"),
}));
const scope = cases.flatMap((item: { id: string; caseId: string }) =>
  (evaluationInput?.artifacts?.[item.caseId]?.provisions ?? [])
    .filter((provision: { id: string }) => nodeIds.has(provision.id))
    .map((provision: { id: string }) => ({ caseId: item.id, provisionId: uid(provision.id) })));

const summary = { runId, provisions: nodes.length, resolvedReferences: resolved.length,
  candidateReferences: candidates.length, unresolvedReferences: unresolved.length,
  semanticLinks: semanticLinks.length, evaluationCases: cases.length,
  evaluationScopeLinks: scope.length, tables: document.tables?.length ?? 0 };
if (values["dry-run"]) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

const url = process.env.NEO4J_URL ?? "http://localhost:7474/db/neo4j/tx/commit";
const auth = process.env.NEO4J_AUTH_HEADER;
if (!auth) throw new Error("NEO4J_AUTH_HEADER is required for Neo4j import");
async function execute(statement: string, batch?: unknown[]) {
  const response = await fetch(url, { method: "POST", headers: {
    "Content-Type": "application/json", Authorization: auth!,
  }, body: JSON.stringify({ statements: [{ statement, parameters: { batch, runId,
    sourceVersionId: draft.sourceVersionId, textHash: draft.textHash } }] }) });
  if (!response.ok) throw new Error(`Neo4j HTTP ${response.status}`);
  const result = await response.json() as { errors?: unknown[] };
  if (result.errors?.length) throw new Error(`Neo4j rejected import: ${JSON.stringify(result.errors)}`);
}
async function batches<T>(items: T[], statement: string) {
  for (let index = 0; index < items.length; index += 100) {
    await execute(statement, items.slice(index, index + 100));
  }
}
await execute("CREATE CONSTRAINT IF NOT EXISTS FOR (p:Provision) REQUIRE p.id IS UNIQUE");
await execute("CREATE CONSTRAINT IF NOT EXISTS FOR (r:IngestionRun) REQUIRE r.id IS UNIQUE");
await execute("MERGE (r:IngestionRun {id:$runId}) SET r.sourceVersionId=$sourceVersionId, r.textHash=$textHash");
await batches(nodes, `UNWIND $batch AS item MERGE (p:Provision {id:item.id})
  SET p += item WITH p MATCH (r:IngestionRun {id:$runId}) MERGE (r)-[:CONTAINS]->(p)`);
await execute(`MATCH (child:Provision {runId:$runId}) WHERE child.parentId IS NOT NULL
  MATCH (parent:Provision {id:child.parentId}) MERGE (parent)-[:PARENT_OF]->(child)`);
await batches(resolved, `UNWIND $batch AS item MATCH (s:Provision {id:item.sourceId})
  MATCH (t:Provision {id:item.targetId}) MERGE (s)-[r:REFERENCES {id:item.id}]->(t)
  SET r += item`);
await batches(candidates, `UNWIND $batch AS item MATCH (s:Provision {id:item.sourceId})
  MATCH (t:Provision {id:item.targetId}) MERGE (s)-[r:CANDIDATE_REFERENCE {id:item.id}]->(t)
  SET r += item`);
await batches(unresolved, `UNWIND $batch AS item MATCH (s:Provision {id:item.sourceId})
  MERGE (u:UnresolvedTarget {id:item.id}) SET u.hint=item.targetHint, u.external=item.external
  MERGE (s)-[r:UNRESOLVED_REFERENCE {id:item.id}]->(u) SET r += item`);
await batches(semanticLinks, `UNWIND $batch AS item MATCH (s:Provision {id:item.sourceId})
  MATCH (t:Provision {id:item.targetId}) MERGE (s)-[r:LEGAL_RELATION {id:item.id}]->(t)
  SET r += item`);
await batches(cases, `UNWIND $batch AS item MERGE (c:EvaluationCase {id:item.id}) SET c += item
  WITH c MATCH (r:IngestionRun {id:$runId}) MERGE (r)-[:HAS_EVALUATION]->(c)`);
await batches(scope, `UNWIND $batch AS item MATCH (c:EvaluationCase {id:item.caseId})
  MATCH (p:Provision {id:item.provisionId}) MERGE (c)-[:IN_EVALUATION_SCOPE]->(p)`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
