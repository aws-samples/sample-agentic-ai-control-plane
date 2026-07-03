// Local CLI entry point for seeding the example data.
//
// In AWS, seeding runs inside the migration Lambda (see migrate.ts). For local
// development, run `pnpm --filter @package/database db:seed`, which loads the
// package's .env (DATABASE_URL + DB_SCHEMA) and calls the seed function.
import "dotenv/config";
import { seedExampleExpenses } from "./seed";

seedExampleExpenses()
  .then(() => {
    console.log("Seed finished.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
