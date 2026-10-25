import { readFile } from "node:fs/promises";
import path from "node:path";

interface Config {
  runDir: string;
  neo4jUrl: string;
  neo4jAuth: string;
}

const config: Config = {
  runDir: path.resolve(
    process.cwd(),
    process.argv[2] ??
      (process.cwd().endsWith("backend")
        ? "evaluation-runs/DPDPA-2023 Act.pdf/d758231c-78a5-4bdd-a21e-fbd3703703aa"
        : "backend/evaluation-runs/DPDPA-2023 Act.pdf/d758231c-78a5-4bdd-a21e-fbd3703703aa")
  ),
  neo4jUrl: process.env.NEO4J_URL ?? "http://localhost:7474/db/neo4j/tx/commit",
  neo4jAuth:
    process.env.NEO4J_AUTH_HEADER ??
    "Basic " + Buffer.from("neo4j:password123").toString("base64"),
};

async function executeCypherBatch(
  statements: Array<{ statement: string; parameters?: Record<string, any> }>
) {
  const response = await fetch(config.neo4jUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: config.neo4jAuth,
    },
    body: JSON.stringify({ statements }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Neo4j HTTP Error ${response.status}: ${errorText}`);
  }

  const result: any = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Cypher Execution Error: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

async function main() {
  console.log(`\n=== Importing Ingestion Graph to Neo4j ===`);
  console.log(`Source run: ${config.runDir}`);
  console.log(`Target Neo4j: ${config.neo4jUrl}\n`);

  // Read raw JSON files
  const readJson = async (file: string) => {
    try {
      return JSON.parse(await readFile(path.join(config.runDir, file), "utf8"));
    } catch {
      return null;
    }
  };

  const [reconstruction, docModel, checkpoint] = await Promise.all([
    readJson("reconstruction.json"),
    readJson("document-model.json"),
    readJson("evaluation-judge-checkpoint.DPDPA-S3-01.glm-5.3-flash.json"),
  ]);

  if (!reconstruction || !reconstruction.provisions) {
    throw new Error(
      `Could not load reconstruction.json from ${config.runDir}`
    );
  }

  // 1. Map evaluation statuses if checkpoint exists
  const nodeEvalMap = new Map<
    string,
    { status: string; reasons: string[] }
  >();

  if (checkpoint && checkpoint.calls) {
    const refs: Record<string, string[]> = {
      "Section 8": [
        "c6406fbd88d281c13b17293840f808b7f900525b0691fa8750863eacbe052061",
      ],
      "Section 8(1)": [
        "c6406fbd88d281c13b17293840f808b7f900525b0691fa8750863eacbe052061",
      ],
      "Section 8(2)": [
        "61c263c78799ace8a9f25fda1273f279397cdd11272deb82f2848d9379022e7e",
      ],
      "Section 8(3)": [
        "ad0adbffa5c1e5a1e7022d8b6a119e1d96bf70bf99575ebb0ff0aa3787d8b3e3",
      ],
      "Section 8(3)(a)": [
        "0eec8745be7b210e1c7fd724aa556870778c0a86b5db0c7346891c727d4b3428",
      ],
      "Section 8(3)(b)": [
        "4393064a26d2017e5677b6aa6688bf643b2cdcd281ea6b2fd6cbf6e3d2066fb1",
      ],
      "Section 8(4)": [
        "586427727fbf269c449144ef92030baaffa3557b90eb25125fa59c3a05cbb957",
      ],
      "Section 8(5)": [
        "0a6780ea2df93be47176a7055a4852811fcbcb86713aeb561e3ad869d543d2ac",
      ],
      "Section 8(6)": [
        "6a1ea4e825b545c1df089f0d7f13252f7b56a0ceb92ec321d89d7bc5d7c172d0",
      ],
      "Section 8(7)": [
        "0e22bfe8e553d4c89218519f672d73b89954da0ea7c5dd7b77d2f9a8679ba296",
      ],
      "Section 8(7)(a)": [
        "01d69e51af9e4f2fe6170374c2be0afed1ec1cbc7bcbd817fee25c258ed9b047",
      ],
      "Section 8(7)(b)": [
        "30a37f248181e81e4706fea8f3f3b992500d2ae25b1e62e55aeef8a944eb7b79",
      ],
      "Section 8(7) illustrations": [
        "f589f906bac434c1d8604f6c578003ba23186b1a47efd865994d351c517d8147",
        "18f3638e5c6aec95699a3cdb50d9e45e2ed1811f2141627f6163367f0b264b80",
      ],
      "Section 8(8)": [
        "c0e1fef2977f5d0acab43da800b64f3f7bdd3a923f5ef20d0b1902281c965c83",
      ],
      "Section 8(8)(a)": [
        "fccd62573633d49efc51e793bdf02d3d5bd6e7e012e86e0ac7adb6230e9f431b",
      ],
      "Section 8(8)(b)": [
        "21b6bb3189aee8de2bff8746b7e9c02bcc5d3a50739bec5f9bc9177c2a279a8b",
      ],
      "Section 8(9)": [
        "e797c84132df26b6005d573af28de91161d77677921414ad193fe31a0152e506",
      ],
      "Section 8(10)": [
        "06f10ecf889681e496573d15725a7a51017ae50d5f7434607f7972e8c5b51554",
      ],
      "Section 8(11)": [
        "08f40a50af991b21ebef91dfdfbdda2fd5581219d0dbe709a4b98e97358884a2",
      ],
    };

    for (const check of checkpoint.calls) {
      for (const [key, ids] of Object.entries(refs)) {
        if (check.field && check.field.includes(key)) {
          for (const id of ids) {
            const existing = nodeEvalMap.get(id) ?? {
              status: "pass",
              reasons: [],
            };
            if (check.verdict === "fail") {
              existing.status = "fail";
            } else if (
              check.verdict === "needs_review" &&
              existing.status !== "fail"
            ) {
              existing.status = "needs_review";
            }
            if (check.reason) existing.reasons.push(check.reason);
            nodeEvalMap.set(id, existing);
          }
        }
      }
    }
  }

  // 2. Prepare schema and clear previous data
  console.log("Setting up Neo4j database constraints & indexes...");
  await executeCypherBatch([
    { statement: "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Provision) REQUIRE p.id IS UNIQUE" },
    { statement: "CREATE INDEX IF NOT EXISTS FOR (p:Provision) ON (p.label)" },
    { statement: "CREATE INDEX IF NOT EXISTS FOR (p:Provision) ON (p.kind)" },
    { statement: "CREATE INDEX IF NOT EXISTS FOR (p:Provision) ON (p.evalStatus)" },
  ]);

  await executeCypherBatch([
    { statement: "MATCH (n) DETACH DELETE n" }, // Clear existing graph
  ]);

  // 3. Batch Create Nodes
  console.log(`Importing ${reconstruction.provisions.length} provision nodes...`);
  const nodeParams = reconstruction.provisions.map((p: any) => {
    const evalData = nodeEvalMap.get(p.id);
    const primaryLabel =
      p.kind === "section"
        ? "Section"
        : p.kind === "chapter"
        ? "Chapter"
        : p.kind === "schedule"
        ? "Schedule"
        : p.kind === "definition"
        ? "Definition"
        : p.kind === "table" || p.kind === "table_row"
        ? "Table"
        : ["paragraph", "subsection", "point"].includes(p.kind)
        ? "Subsection"
        : "TextItem";

    const label = p.canonicalCitation || p.label || p.text?.slice(0, 80) || p.kind;
    return {
      id: p.id,
      label,
      canonicalCitation: p.canonicalCitation || null,
      kind: p.kind,
      category: primaryLabel,
      text: p.text || "",
      start: p.start ?? 0,
      end: p.end ?? 0,
      page: p.sourceSpans?.[0]?.physicalPage ?? null,
      parentId: p.parentId ?? null,
      evalStatus: evalData?.status ?? "untested",
      evalReasons: evalData?.reasons?.join("\n---\n") ?? "",
      reviewStatus: p.status ?? "candidate",
    };
  });

  const batchSize = 100;
  for (let i = 0; i < nodeParams.length; i += batchSize) {
    const chunk = nodeParams.slice(i, i + batchSize);
    await executeCypherBatch([
      {
        statement: `
          UNWIND $batch AS item
          CREATE (p:Provision {
            id: item.id,
            label: item.label,
            canonicalCitation: item.canonicalCitation,
            kind: item.kind,
            category: item.category,
            text: item.text,
            start: item.start,
            end: item.end,
            page: item.page,
            parentId: item.parentId,
            evalStatus: item.evalStatus,
            evalReasons: item.evalReasons,
            reviewStatus: item.reviewStatus
          })
        `,
        parameters: { batch: chunk },
      },
    ]);
  }

  // 4. Batch Create Parent-Child Hierarchy Edges
  console.log("Creating hierarchy relationships (PARENT_OF)...");
  await executeCypherBatch([
    {
      statement: `
        MATCH (child:Provision)
        WHERE child.parentId IS NOT NULL
        MATCH (parent:Provision { id: child.parentId })
        CREATE (parent)-[:PARENT_OF]->(child)
      `,
    },
  ]);

  // 5. Batch Create Reference Edges (Resolved and Unresolved)
  console.log("Creating reference relationships (REFERENCES / UNRESOLVED)...");
  const rels = reconstruction.relationships ?? [];
  const resolvedRels: any[] = [];
  const unresolvedRels: any[] = [];

  for (const r of rels) {
    if (r.targetProvisionIds && r.targetProvisionIds.length > 0) {
      for (const targetId of r.targetProvisionIds) {
        resolvedRels.push({
          id: r.id,
          sourceId: r.sourceProvisionId,
          targetId: targetId,
          mention: r.exactMention,
          status: r.status,
          targetHint: r.targetHint ?? null,
          relationType: r.relationType ?? "explicit_reference",
        });
      }
    } else {
      unresolvedRels.push({
        id: r.id,
        sourceId: r.sourceProvisionId,
        mention: r.exactMention,
        status: r.status,
        targetHint: r.targetHint ?? null,
        relationType: r.relationType ?? "explicit_reference",
      });
    }
  }

  for (let i = 0; i < resolvedRels.length; i += batchSize) {
    const chunk = resolvedRels.slice(i, i + batchSize);
    await executeCypherBatch([
      {
        statement: `
          UNWIND $batch AS rel
          MATCH (s:Provision { id: rel.sourceId })
          MATCH (t:Provision { id: rel.targetId })
          CREATE (s)-[:REFERENCES {
            id: rel.id,
            mention: rel.mention,
            status: rel.status,
            targetHint: rel.targetHint,
            type: rel.relationType
          }]->(t)
        `,
        parameters: { batch: chunk },
      },
    ]);
  }

  // Create unresolved reference nodes to highlight broken/missing edges
  for (let i = 0; i < unresolvedRels.length; i += batchSize) {
    const chunk = unresolvedRels.slice(i, i + batchSize);
    await executeCypherBatch([
      {
        statement: `
          UNWIND $batch AS rel
          MATCH (s:Provision { id: rel.sourceId })
          MERGE (u:UnresolvedTarget { hint: coalesce(rel.targetHint, rel.mention) })
          CREATE (s)-[:UNRESOLVED_REFERENCE {
            id: rel.id,
            mention: rel.mention,
            status: rel.status
          }]->(u)
        `,
        parameters: { batch: chunk },
      },
    ]);
  }

  console.log("\n=== Import Finished Successfully! ===");
  console.log(`- Imported: ${nodeParams.length} provisions`);
  console.log(`- Created: hierarchy edges + ${resolvedRels.length} resolved reference edges`);
  console.log(`- Created: ${unresolvedRels.length} unresolved reference links\n`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
