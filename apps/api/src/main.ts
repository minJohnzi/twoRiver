import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/connection.js";

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
const app = buildApp({ config, db });

await app.listen({ port: config.PORT, host: "0.0.0.0" });
