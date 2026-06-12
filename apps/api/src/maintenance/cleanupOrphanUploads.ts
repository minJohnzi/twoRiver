import { loadConfig } from "../config.js";
import { openDatabase } from "../db/connection.js";
import { cleanupOrphanUploads } from "../services/uploads/orphanCleanupService.js";

const dryRun = !process.argv.includes("--delete");
const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);

try {
  const result = await cleanupOrphanUploads(config, db, { dryRun });
  const mode = dryRun ? "dry-run" : "delete";

  console.log(`Upload cleanup ${mode} complete.`);
  console.log(`Retained: ${result.retained.length}`);
  console.log(`Removed: ${result.removed.length}`);

  for (const url of result.removed) {
    console.log(`- ${url}`);
  }
} finally {
  db.close();
}
