import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/connection.js";
import { migrate } from "./db/migrate.js";

const config = loadConfig();
migrate(config.DATABASE_PATH);
const db = openDatabase(config.DATABASE_PATH);
const app = buildApp({ config, db });

await app.listen({ port: config.PORT, host: "0.0.0.0" });
