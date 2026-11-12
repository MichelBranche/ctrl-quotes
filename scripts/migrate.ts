import { ensureMigrated } from "../src/db/client.ts";

await ensureMigrated();
console.log("Migrazioni applicate.");
