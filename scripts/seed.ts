import "dotenv/config";
import { db } from "../src/server/db";
import { bootstrap } from "./seed/bootstrap";

bootstrap()
  .then(() => {
    console.log("\nNext: create your first admin →  npm run admin:create -- you@example.com \"Your Name\"");
    console.log("Or load demo data (fictional, removable) →  npm run db:seed:demo");
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
