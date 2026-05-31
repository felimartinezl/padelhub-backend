/**
 * Siembra 500 usuarios de prueba en la BD y genera artillery/data/test-users.csv
 * Uso: npx ts-node --project tsconfig.test.json scripts/seed-load-test.ts
 *      npx ts-node --project tsconfig.test.json scripts/seed-load-test.ts --clean
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { writeFileSync } from "fs";

const TOTAL_USERS  = 500;
const BATCH_SIZE   = 50;
const RUT_BASE     = 11_000_001;
const PASSWORD     = "LoadTest!1";
const CSV_PATH     = path.resolve(__dirname, "../artillery/data/test-users.csv");

async function main() {
  const clean = process.argv.includes("--clean");

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });

  try {
    if (clean) {
      console.log("Limpiando usuarios de carga...");
      await prisma.users.deleteMany({
        where: { rut: { gte: RUT_BASE, lte: RUT_BASE + TOTAL_USERS - 1 } },
      });
      console.log("Usuarios eliminados.");
      return;
    }

    // Un solo hash para todos (bcrypt es costoso — reutilizar es suficiente para tests)
    console.log("Generando hash de contraseña...");
    const password_hash = await bcrypt.hash(PASSWORD, 8);

    let created = 0;
    const csvRows = ["rut,password"];

    for (let batch = 0; batch < TOTAL_USERS / BATCH_SIZE; batch++) {
      const data = Array.from({ length: BATCH_SIZE }, (_, i) => {
        const rut = RUT_BASE + batch * BATCH_SIZE + i;
        return {
          rut,
          dv_rut:        "0",
          name:          `Load User ${rut}`,
          phone:         `+569${String(rut).slice(-8)}`,
          password_hash,
          level:         "tercera" as const,
          zone:          "Santiago",
          mmr:           1000,
          role:          "player" as const,
          is_active:     true,
        };
      });

      await prisma.users.createMany({ data, skipDuplicates: true });
      data.forEach((u) => csvRows.push(`${u.rut},${PASSWORD}`));

      created += data.length;
      process.stdout.write(`\rUsuarios creados: ${created}/${TOTAL_USERS}`);
    }

    writeFileSync(CSV_PATH, csvRows.join("\n") + "\n", "utf-8");
    console.log(`\nCSV generado en: ${CSV_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
