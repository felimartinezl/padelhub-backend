import { prisma } from "./prisma";
import type { user_level } from "@prisma/client";

interface MmrResult {
  user_id: string;
  mmr_before: number;
  mmr_after: number;
}

// 7ma+ es el nivel más alto; 1ra es el más bajo (principiante)
const MMR_THRESHOLDS: { level: user_level; min: number }[] = [
  { level: "septima_mas", min: 1350 },
  { level: "sexta",       min: 1250 },
  { level: "quinta",      min: 1150 },
  { level: "cuarta",      min: 1050 },
  { level: "tercera",     min: 950  },
  { level: "segunda",     min: 800  },
  { level: "primera",     min: 0    },
];

function levelFromMMR(mmr: number): user_level {
  return MMR_THRESHOLDS.find((t) => mmr >= t.min)?.level ?? "primera";
}

/**
 * Llama a la API externa de MMR y guarda los resultados en la BD.
 * Si MMR_API_URL no está configurada o la API falla, lanza un error.
 */
export async function calculateAndStoreMMR(matchId: string): Promise<void> {
  const url = process.env.MMR_API_URL;
  if (!url) throw new Error("MMR_API_URL no está configurada");

  const match = await prisma.matches.findUnique({
    where: { id: matchId },
    select: {
      format: true,
      match_results: { select: { winner: true } },
      match_players: {
        where: { status: "confirmed" },
        select: {
          user_id: true,
          team: true,
          users: { select: { mmr: true } },
        },
      },
    },
  });

  if (!match?.match_results) throw new Error("Resultado no encontrado para el partido");

  const players = match.match_players.map((p) => ({
    user_id: p.user_id,
    team: p.team,
    mmr: p.users.mmr,
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      match_id: matchId,
      format: match.format,
      winner: match.match_results.winner,
      players,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MMR API respondió ${res.status}: ${body}`);
  }

  const { results }: { results: MmrResult[] } = await res.json();

  await prisma.$transaction([
    ...results.map((r) =>
      prisma.users.update({
        where: { id: r.user_id },
        data: { mmr: r.mmr_after, level: levelFromMMR(r.mmr_after), updated_at: new Date() },
      })
    ),
    ...results.map((r) =>
      prisma.mmr_history.create({
        data: {
          user_id: r.user_id,
          match_id: matchId,
          mmr_before: r.mmr_before,
          mmr_after: r.mmr_after,
        },
      })
    ),
  ]);
}
