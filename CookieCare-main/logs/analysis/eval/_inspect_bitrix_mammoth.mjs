import fs from "fs";
import mammoth from "mammoth";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const path = "C:/Users/abhinav.yadav_randst/Downloads/DPA - 1.docx";
const out = "c:/Program Files/CookieCare/CookieCare-main/logs/analysis/eval/_bitrix_mammoth.txt";

const buf = fs.readFileSync(path);
const { value: html } = await mammoth.convertToHtml({ buffer: buf });
const tableCount = (html.match(/<table\b/gi) || []).length;
const trCount = (html.match(/<tr\b/gi) || []).length;
const tdCount = (html.match(/<td\b/gi) || []).length;

// Dynamic import of compiled extractText is hard; inline Phase 1A-ish check:
const hasAppendix = /appendix\s*1/i.test(html);
const hasPersonalDetails = /Personal details/i.test(html);
const hasStaff = /Staff including/i.test(html);

const lines = [
  `mammoth html length=${html.length}`,
  `html <table>=${tableCount} <tr>=${trCount} <td>=${tdCount}`,
  `has Appendix 1=${hasAppendix}`,
  `has Personal details=${hasPersonalDetails}`,
  `has Staff including=${hasStaff}`,
  "--- first table snippet ---",
];
const m = html.match(/<table[\s\S]*?<\/table>/i);
if (m) lines.push(m[0].slice(0, 1500));
else lines.push("(no table)");

// Find PROCESSING SUBJECT context
const idx = html.search(/PROCESSING SUBJECT|Appendix 1/i);
if (idx >= 0) lines.push("--- around appendix ---", html.slice(Math.max(0, idx - 200), idx + 800));

fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote", out);
