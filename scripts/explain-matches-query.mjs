/**
 * Diagnóstico de índices para GET /api/matches con paginación.
 * Corre EXPLAIN (ANALYZE, BUFFERS) sobre las dos queries que genera Prisma:
 *   - COUNT para la metadata de paginación
 *   - SELECT paginado con OFFSET
 *
 * Uso:
 *   node scripts/explain-matches-query.mjs [club] [page]
 *
 * Ejemplos:
 *   node scripts/explain-matches-query.mjs                      # LOAD_MP01, pág 1
 *   node scripts/explain-matches-query.mjs LOAD_MP01 500        # LOAD_MP01, pág 500
 *   node scripts/explain-matches-query.mjs LOAD_MP01 1000       # última pág con 10k rows
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: ".env.test" });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

const CLUB   = process.argv[2] ?? "LOAD_MP01";
const PAGE   = Math.max(1, parseInt(process.argv[3] ?? "1", 10));
const LIMIT  = 10;
const OFFSET = (PAGE - 1) * LIMIT;

function hr(char = "═", n = 72) { return char.repeat(n); }

async function explain(label, sql) {
  console.log(`\n${hr()}`);
  console.log(label);
  console.log(hr("-"));
  const rows = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`
  );
  rows.forEach((r) => console.log(r["QUERY PLAN"]));
}

async function main() {
  console.log(`\n${hr()}`);
  console.log(`EXPLAIN ANALYZE  club="${CLUB}"  page=${PAGE}  limit=${LIMIT}  offset=${OFFSET}`);
  console.log(hr());

  // Query 1: COUNT para calcular total de páginas
  await explain(
    "1/2 — COUNT (metadata de paginación)",
    `SELECT COUNT(*) FROM matches WHERE status = 'open' AND club = '${CLUB}'`
  );

  // Query 2: SELECT paginado (equivalente a lo que Prisma genera)
  await explain(
    `2/2 — SELECT página ${PAGE} (OFFSET ${OFFSET})`,
    `
      SELECT m.id, m.club, m.format, m.status, m.match_date, m.match_time, m.organizer_id
      FROM   matches m
      WHERE  m.status = 'open'
        AND  m.club   = '${CLUB}'
      ORDER  BY m.match_date ASC
      LIMIT  ${LIMIT}
      OFFSET ${OFFSET}
    `
  );

  console.log(`\n${hr()}`);
  console.log("Índices actuales en la tabla matches:");
  console.log("  idx_matches_status     → (status)");
  console.log("  idx_matches_date       → (match_date)");
  console.log("  idx_matches_organizer  → (organizer_id)");
  console.log();
  console.log("Si ves Seq Scan en COUNT o SELECT con 10k+ filas, considera:");
  console.log("  CREATE INDEX idx_matches_status_club_date");
  console.log("    ON matches (status, club, match_date ASC);");
  console.log(`${hr()}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
