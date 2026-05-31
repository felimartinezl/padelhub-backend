import { createRequire } from "module";
const require = createRequire(import.meta.url);

require("dotenv").config({ path: ".env.test" });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

async function run(sql) {
  await prisma.$executeRawUnsafe(sql);
}

async function main() {
  const url = process.env.DIRECT_URL ?? "";
  console.log("Applying schema diff to test DB:", url.slice(0, 50) + "...");

  // match_players — añadidos tras la migración inicial
  await run(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS confirmed_presence BOOLEAN NOT NULL DEFAULT false`);
  await run(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS presence_confirmed_at TIMESTAMP`);
  console.log("✓ match_players: confirmed_presence, presence_confirmed_at");

  // match_results — añadidos tras la migración inicial
  await run(`ALTER TABLE match_results ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false`);
  await run(`ALTER TABLE match_results ADD COLUMN IF NOT EXISTS confirmed_by UUID`);
  await run(`ALTER TABLE match_results ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`);
  console.log("✓ match_results: confirmed, confirmed_by, confirmed_at");

  console.log("\nTest DB schema sync completo.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
