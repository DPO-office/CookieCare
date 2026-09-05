import fs from "node:fs";

const t = fs.readFileSync(
  "C:/Program Files/CookieCare/CookieCare-main/logs/analysis/an_d8021da4-5d61-4837-b7db-15dc0296775e.log",
  "utf8"
);
const out = [];
out.push("data_categories verify=" + t.includes("candidate-by-candidate — data_categories"));
out.push("data_categories string=" + (t.match(/data_categor\w+/g) || []).slice(0, 20).join(","));
out.push("Staff including=" + (t.split("Staff including").length - 1));
out.push("Personal details=" + (t.split("Personal details").length - 1));
out.push("Collecting, recording=" + (t.split("Collecting, recording").length - 1));
out.push("Term means=" + (t.split("Term” means").length - 1 + t.split('Term" means').length - 1 + t.split("“Term” means").length - 1));

const i = t.indexOf("PROCESSING SUBJECT MATTER");
out.push("\nS42 context:\n" + t.slice(i, i + 700));

const d = t.indexOf("[VERIFY] candidate-by-candidate — duration");
const dend = t.indexOf("[VERIFY] candidate-by-candidate — ", d + 40);
const dblock = t.slice(d, dend);
out.push("\nduration candidates:\n" + [...dblock.matchAll(/\[[0-9]+\] S[0-9]+[^\n]*/g)].join("\n"));
out.push("\nduration mentions Term definition=" + /“Term”|Term means|definition/i.test(dblock));

// Why analysis incomplete for categories - search stamp
out.push("\ninsufficient_evidence lines:");
for (const m of t.matchAll(/[^\n]{0,40}insufficient_evidence[^\n]{0,120}/g)) out.push(m[0]);
out.push("\nno candidate proved lines:");
for (const m of t.matchAll(/[^\n]{0,20}no candidate proved[^\n]{0,160}/g)) out.push(m[0]);

fs.writeFileSync(
  "C:/Program Files/CookieCare/CookieCare-main/logs/analysis/eval/log-forensics2.txt",
  out.join("\n")
);
