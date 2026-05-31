import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import { PrismaClient } from "@prisma/client";
import { E2E_USER, E2E_PLAYERS, E2E_ADMIN } from "./global-setup";

export default async function globalTeardown() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });
  try {
    const allIds = [E2E_USER.id, ...E2E_PLAYERS.map((p) => p.id), E2E_ADMIN.id];

    // Buscar todos los matches organizados por nuestros usuarios de E2E
    const matchIds = (
      await prisma.matches.findMany({
        where:  { organizer_id: { in: allIds } },
        select: { id: true },
      })
    ).map((m) => m.id);

    if (matchIds.length > 0) {
      await prisma.mmr_history.deleteMany({ where: { match_id: { in: matchIds } } });
      await prisma.match_results.deleteMany({ where: { match_id: { in: matchIds } } });
      await prisma.match_players.deleteMany({ where: { match_id: { in: matchIds } } });
      await prisma.matches.deleteMany({ where: { id: { in: matchIds } } });
    }

    // Limpiar relaciones restantes antes de borrar usuarios
    await prisma.match_players.deleteMany({ where: { user_id: { in: allIds } } });
    await prisma.mmr_history.deleteMany({ where: { user_id: { in: allIds } } });
    await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: allIds } } });
    await prisma.users.deleteMany({ where: { id: { in: allIds } } });

    console.log("[E2E teardown] Usuarios y datos de prueba eliminados:", allIds.length, "usuarios");
  } finally {
    await prisma.$disconnect();
  }
}
