import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "db.json");

export function loadDatabase(): any {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch (err) {
    console.warn("Local JSON database load failed:", err);
  }
  return {
    users: [],
    documents: [],
    folders: [],
    library_items: [],
    cookies: [],
    scans: [],
    agreements: [],
    queues: []
  };
}

export function saveDatabase(data: any): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Local JSON database save failed:", err);
  }
}
