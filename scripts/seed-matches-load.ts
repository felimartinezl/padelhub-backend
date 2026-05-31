/**
 * Siembra datos de carga para las pruebas de rendimiento MP-01 y MP-02.
 * Requiere que seed:load haya corrido antes (usuarios rut 11_000_001..004).
 *
 * Uso:
 *   npx ts-node --project tsconfig.test.json scripts/seed-matches-load.ts --mode mp01
 *   npx ts-node --project tsconfig.test.json scripts/seed-matches-load.ts --mode mp02
 *   npx ts-node --project tsconfig.test.json scripts/seed-matches-load.ts --clean
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const MP01_CLUB     = "LOAD_MP01";
const MP02_CLUB     = "LOAD_MP02";
const TOTAL_MP01    = 10_000;
const TOTAL_MP02    = 100;
const BATCH_SIZE    = 500;
const ORGANIZER_RUT = 11_000_001;
const PLAYER_RUTS   = [11_000_002, 11_000_003, 11_000_004];

function makePrisma() {
  return new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });
}

async function clean(prisma: PrismaClient) {
  console.log("Limpiando datos de carga de matches...");
  for (const club of [MP01_CLUB, MP02_CLUB]) {
    const ids = (
      await prisma.matches.findMany({ where: { club }, select: { id: true } })
    ).map((m) => m.id);
    if (ids.length === 0) { console.log(`  ${club}: sin datos`); continue; }
    await prisma.match_results.deleteMany({ where: { match_id: { in: ids } } });
    await prisma.match_players.deleteMany({ where: { match_id: { in: ids } } });
    await prisma.matches.deleteMany({ where: { id: { in: ids } } });
    console.log(`  ${club}: ${ids.length} matches eliminados`);
  }
}

async function seedMP01(prisma: PrismaClient, organizerId: string) {
  console.log(`\nSembrando ${TOTAL_MP01.toLocaleString()} matches para MP-01 (club="${MP01_CLUB}")...`);

  const existing = (
    await prisma.matches.findMany({ where: { club: MP01_CLUB }, select: { id: true } })
  ).map((m) => m.id);
  if (existing.length > 0) {
    await prisma.match_players.deleteMany({ where: { match_id: { in: existing } } });
    await prisma.matches.deleteMany({ where: { id: { in: existing } } });
  }

  const base = new Date("2026-06-01T00:00:00Z");
  let created = 0;

  for (let b = 0; b < TOTAL_MP01 / BATCH_SIZE; b++) {
    const data = Array.from({ length: BATCH_SIZE }, (_, i) => ({
      organizer_id: organizerId,
      club:         MP01_CLUB,
      format:       "doubles" as const,
      status:       "open" as const,
      match_date:   new Date(base.getTime() + (b * BATCH_SIZE + i) * 86_400_000),
      match_time:   new Date("2026-01-01T10:00:00Z"),
    }));
    await prisma.matches.createMany({ data });
    created += BATCH_SIZE;
    process.stdout.write(`\r  Progreso: ${created.toLocaleString()}/${TOTAL_MP01.toLocaleString()}`);
  }
  console.log(`\n  MP-01 listo: ${created.toLocaleString()} matches sembrados`);
}

async function seedMP02(prisma: PrismaClient, organizerId: string, playerIds: string[]) {
  console.log(`\nSembrando ${TOTAL_MP02} matches para MP-02 (club="${MP02_CLUB}")...`);

  const existing = (
    await prisma.matches.findMany({ where: { club: MP02_CLUB }, select: { id: true } })
  ).map((m) => m.id);
  if (existing.length > 0) {
    await prisma.match_results.deleteMany({ where: { match_id: { in: existing } } });
    await prisma.match_players.deleteMany({ where: { match_id: { in: existing } } });
    await prisma.matches.deleteMany({ where: { id: { in: existing } } });
  }

  const matchIds: string[] = [];
  const CHUNK = 20;

  for (let b = 0; b < TOTAL_MP02 / CHUNK; b++) {
    const batch = await Promise.all(
      Array.from({ length: CHUNK }, () =>
        prisma.matches.create({
          data: {
            organizer_id: organizerId,
            club:         MP02_CLUB,
            format:       "doubles",
            status:       "in_progress",
            match_date:   new Date("2026-06-01"),
            match_time:   new Date("2026-01-01T10:00:00Z"),
          },
          select: { id: true },
        })
      )
    );
    matchIds.push(...batch.map((m) => m.id));
    process.stdout.write(`\r  Matches: ${matchIds.length}/${TOTAL_MP02}`);
  }

  // 4 jugadores confirmados por match (necesarios para validar submitted_by en /result)
  const playersData = matchIds.flatMap((id) => [
    { match_id: id, user_id: organizerId,  team: "team_a" as const, status: "confirmed" as const },
    { match_id: id, user_id: playerIds[0], team: "team_a" as const, status: "confirmed" as const },
    { match_id: id, user_id: playerIds[1], team: "team_b" as const, status: "confirmed" as const },
    { match_id: id, user_id: playerIds[2], team: "team_b" as const, status: "confirmed" as const },
  ]);
  await prisma.match_players.createMany({ data: playersData, skipDuplicates: true });

  const csvPath = path.resolve(__dirname, "../artillery/data/mp02-matches.csv");
  const rows    = ["match_id,submitted_by", ...matchIds.map((id) => `${id},${organizerId}`)];
  writeFileSync(csvPath, rows.join("\n") + "\n", "utf-8");

  console.log(`\n  MP-02 listo: ${matchIds.length} matches + ${playersData.length} jugadores`);
  console.log(`  CSV generado: ${csvPath}`);
}

async function main() {
  const args    = process.argv.slice(2);
  const modeIdx = args.indexOf("--mode");
  const mode    = modeIdx !== -1 ? args[modeIdx + 1] : null;
  const doClean = args.includes("--clean");

  const prisma = makePrisma();
  try {
    if (doClean) { await clean(prisma); return; }

    const organizer = await prisma.users.findFirst({
      where: { rut: ORGANIZER_RUT },
      select: { id: true },
    });
    if (!organizer) {
      throw new Error(
        `Organizador (rut=${ORGANIZER_RUT}) no encontrado. Ejecuta primero: npm run seed:load`
      );
    }

    const players = await prisma.users.findMany({
      where: { rut: { in: PLAYER_RUTS } },
      select: { id: true },
    });
    if (players.length < 3) {
      throw new Error(
        `Se necesitan al menos 3 jugadores (ruts ${PLAYER_RUTS.join(", ")}). Ejecuta: npm run seed:load`
      );
    }

    if (!mode || mode === "mp01") await seedMP01(prisma, organizer.id);
    if (!mode || mode === "mp02") await seedMP02(prisma, organizer.id, players.map((p) => p.id));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
