import { config } from "dotenv";
config({ path: "c:/Program Files/CookieCare/CookieCare-main/.env" });
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "fs";
import { complianceReportingInput } from "../src/modules/analysis/capabilities/reporting/compliance-reporting.js";
import { defaultCompliancePresentationPlan, resolveCompliancePresentationMode } from "../src/modules/analysis/capabilities/reporting/compliance-presentation.js";
import { loadComplianceReportingGuidance } from "../src/modules/analysis/capabilities/reporting/guidance/index.js";

const data = JSON.parse(readFileSync("c:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/compliance-pre-report/out/latest.json", "utf8"));
const snapshot = data.handedToReporting;
const mode = "layered";
const fallbackPlan = defaultCompliancePresentationPlan(snapshot, mode);
const lockedData = complianceReportingInput(snapshot);
const guidance = loadComplianceReportingGuidance(data.instruction, snapshot);

const ids = lockedData.rows.map(r => r.findingId);
const questionIds = [...new Set(lockedData.rows.flatMap(row => row.answers ?? []).map(answer => answer.questionId).filter(id => id !== "user_request"))];

const PLAN_SCHEMA = {
  type: "OBJECT", properties: {
    version: { type: "INTEGER" },
    mode: { type: "STRING", enum: ["layered", "short", "detailed", "narrative", "table_only"] },
    paragraphLimit: { type: "INTEGER" },
    rationale: { type: "STRING" },
    sections: { type: "ARRAY", items: { type: "OBJECT", properties: {
      id: { type: "STRING" },
      requestItemIds: { type: "ARRAY", items: { type: "STRING", enum: ["request:primary"] } },
      questionIds: { type: "ARRAY", items: { type: "STRING" } },
      kind: { type: "STRING", enum: ["answer", "overview", "risks", "details", "actions", "conclusion", "limitations", "sources"] },
      heading: { type: "STRING" }, findingIds: { type: "ARRAY", items: { type: "STRING" } },
      columns: { type: "ARRAY", items: { type: "STRING", enum: [
        "Requirement", "Status", "Contract provision", "Assessment", "Gap or qualification", "Recommended action",
        "Parties and roles", "Transfer mechanism", "Destination", "Legal basis", "Timing",
      ] } },
      detailWords: { type: "INTEGER" },
    }, required: ["id", "requestItemIds", "questionIds", "kind", "heading", "findingIds", "columns", "detailWords"] } },
  }, required: ["version", "mode", "paragraphLimit", "rationale", "sections"],
};

const DRAFT_SCHEMA = {
  type: "OBJECT", properties: {
    answer: { type: "STRING" },
    rows: { type: "ARRAY", items: { type: "OBJECT", properties: {
      findingId: { type: "STRING" }, assessment: { type: "STRING" }, explanation: { type: "STRING" }, recommendedAction: { type: "STRING" },
    }, required: ["findingId", "assessment", "explanation", "recommendedAction"] } },
  }, required: ["answer", "rows"],
};

const composeSchema = {
  type: "OBJECT",
  properties: {
    plan: PLAN_SCHEMA,
    draft: DRAFT_SCHEMA,
  },
  required: ["plan", "draft"],
};

async function testApi() {
  const apiKey = process.env.GOOGLE_GEMINI_EXTERNAL_KEY;
  console.log("Using apiKey:", apiKey?.slice(0, 8) + "...");
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    console.log("Calling generateContent with composeSchema...");
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello",
      config: {
        responseMimeType: "application/json",
        responseSchema: composeSchema as any,
      }
    });
    console.log("Success with simple hello:", res.text);
  } catch (err: any) {
    console.error("Error with composeSchema:", err);
  }
}

testApi();
