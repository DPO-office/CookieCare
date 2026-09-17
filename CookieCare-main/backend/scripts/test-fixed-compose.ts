import { config } from "dotenv";
config({ path: "c:/Program Files/CookieCare/CookieCare-main/.env" });
import { readFileSync } from "fs";
import { executeJsonCompletion, LLMProvider, LLMTask } from "../src/llm/index.js";
import { complianceReportingInput } from "../src/modules/analysis/capabilities/reporting/compliance-reporting.js";
import { defaultCompliancePresentationPlan, resolveCompliancePresentationMode } from "../src/modules/analysis/capabilities/reporting/compliance-presentation.js";
import { loadComplianceReportingGuidance } from "../src/modules/analysis/capabilities/reporting/guidance/index.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";

const PLAN_SCHEMA = {
  type: "object", properties: {
    version: { type: "integer" },
    mode: { type: "string", enum: ["layered", "short", "detailed", "narrative", "table_only"] },
    paragraphLimit: { type: "integer" },
    rationale: { type: "string" },
    sections: { type: "array", items: { type: "object", properties: {
      id: { type: "string" },
      requestItemIds: { type: "array", items: { type: "string", enum: ["request:primary"] } },
      questionIds: { type: "array", items: { type: "string" } },
      kind: { type: "string", enum: ["answer", "overview", "risks", "details", "actions", "conclusion", "limitations", "sources"] },
      heading: { type: "string" }, findingIds: { type: "array", items: { type: "string" } },
      columns: { type: "array", items: { type: "string", enum: [
        "Requirement", "Status", "Contract provision", "Assessment", "Gap or qualification", "Recommended action",
        "Parties and roles", "Transfer mechanism", "Destination", "Legal basis", "Timing",
      ] } },
      detailWords: { type: "integer" },
    }, required: ["id", "requestItemIds", "questionIds", "kind", "heading", "findingIds", "columns", "detailWords"] } },
  }, required: ["version", "mode", "paragraphLimit", "rationale", "sections"],
};
const DRAFT_SCHEMA = {
  type: "object", properties: {
    answer: { type: "string" },
    rows: { type: "array", items: { type: "object", properties: {
      findingId: { type: "string" }, assessment: { type: "string" }, explanation: { type: "string" }, recommendedAction: { type: "string" },
    }, required: ["findingId", "assessment", "explanation", "recommendedAction"] } },
  }, required: ["answer", "rows"],
};

function constrainedPlanSchema(ids: string[], questionIds: string[]) {
  return { ...PLAN_SCHEMA, properties: { ...PLAN_SCHEMA.properties,
    sections: { ...PLAN_SCHEMA.properties.sections, items: { ...PLAN_SCHEMA.properties.sections.items,
      properties: { ...PLAN_SCHEMA.properties.sections.items.properties,
        findingIds: { type: "array", items: { type: "string", enum: ids } },
        questionIds: { type: "array", items: questionIds.length
          ? { type: "string", enum: questionIds } : { type: "string" } },
      },
    } },
  } };
}

function constrainedDraftSchema(ids: string[]) {
  return { ...DRAFT_SCHEMA, properties: { ...DRAFT_SCHEMA.properties,
    rows: { ...DRAFT_SCHEMA.properties.rows, minItems: ids.length, maxItems: ids.length,
      items: { ...DRAFT_SCHEMA.properties.rows.items,
        properties: { ...DRAFT_SCHEMA.properties.rows.items.properties,
          findingId: { type: "string", enum: ids } } } } } };
}

async function main() {
  const data = JSON.parse(readFileSync("c:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/compliance-pre-report/out/latest.json", "utf8"));
  
  const state: AnalysisState = {
    request: {
      instruction: data.instruction,
      sessionId: data.sessionId,
    },
    intent: {
      operation: "compliance_check",
    },
    complianceReportSnapshot: data.handedToReporting,
  };

  const snapshot = data.handedToReporting;
  const mode = resolveCompliancePresentationMode(state);
  const fallbackPlan = defaultCompliancePresentationPlan(snapshot, mode);
  const lockedData = complianceReportingInput(snapshot);
  const guidance = loadComplianceReportingGuidance(state.request.instruction, snapshot);

  const ids = lockedData.rows.map(r => r.findingId);
  const questionIds = [...new Set(lockedData.rows.flatMap(row => row.answers ?? []).map(answer => answer.questionId).filter(id => id !== "user_request"))];

  const composeSchema = {
    type: "object",
    properties: {
      plan: constrainedPlanSchema(ids, questionIds),
      draft: constrainedDraftSchema(ids),
    },
    required: ["plan", "draft"],
  };

  console.log("Calling Gemini compose with fixed schema...");
  const raw = await executeJsonCompletion(
    JSON.stringify({
      userIntent: state.request.instruction,
      perspective: state.intent?.partyPerspective,
      mode,
      defaultPlan: fallbackPlan,
      lockedData,
    }),
    guidance.system.compose,
    composeSchema,
    LLMTask.STRUCTURAL_JSON_LITE,
    LLMProvider.GEMINI,
    { maxOutputTokens: 16000 }
  );

  console.log("SUCCESS! Compose returned!");
  console.log("Keys:", Object.keys(raw as object));
  const plan = (raw as any).plan;
  const draft = (raw as any).draft;
  console.log("Plan mode:", plan.mode);
  console.log("Plan sections:", plan.sections.map((s: any) => `${s.id}: ${s.kind} - ${s.heading} (findings: ${s.findingIds.length})`));
  console.log("Draft answer:", draft.answer);
  console.log("Draft first row:", draft.rows[0]);
}

main().catch(err => {
  console.error("Compose failed:", err);
});
