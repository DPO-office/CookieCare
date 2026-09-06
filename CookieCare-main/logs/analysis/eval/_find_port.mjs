import { execSync } from "child_process";
import fs from "fs";
const out = execSync("netstat -ano", { encoding: "utf8" });
const lines = out.split(/\r?\n/).filter((l) => l.includes(":3000") && l.includes("LISTENING"));
fs.writeFileSync(
  "logs/analysis/eval/_port3000.txt",
  lines.join("\n") || "none"
);
