import { config } from "dotenv";
config({ path: "c:/Program Files/CookieCare/CookieCare-main/.env" });
import { executeJsonCompletion, LLMProvider, LLMTask } from "../src/llm/index.js";

async function main() {
  try {
    const res = await executeJsonCompletion(
      "Hello world",
      "Return a JSON object with message: 'ok'",
      { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
      LLMTask.STRUCTURAL_JSON_LITE,
      LLMProvider.GEMINI,
    );
    console.log("Success:", res);
  } catch (err) {
    console.error("Gemini call error:", err);
  }
}
main();
