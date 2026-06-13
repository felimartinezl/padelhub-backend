import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const DEFAULT_MMR_RANGE = 150;
const RECENT_MATCHES_EXCLUDE = 5;

export async function GET(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const { searchParams } = new URL(request.url);

    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);

    const rawRange = parseInt(searchParams.get("mmr_range") ?? String(DEFAULT_MMR_RANGE), 10);
    const mmrRange = isNaN(rawRange) || rawRange < 1 ? DEFAULT_MMR_RANGE : rawRange;

    const filterZone = searchParams.get("zone") !== "false";

    const me = await prisma.users.findFirst({
      where: { rut: parseInt(rut) },
      select: { id: true, mmr: true, zone: true },
    });

    if (!me) {
      return NextResponse.json(
        { error: `No se encontró ningún jugador con el RUT ${rut}` },
        { status: 404 }
      );
    }

    // Obtener IDs de jugadores con quienes ha jugado recientemente
    const recentHistory = await prisma.mmr_history.findMany({
      where: { user_id: me.id },
      orderBy: { calculated_at: "desc" },
      take: RECENT_MATCHES_EXCLUDE,
      select: { match_id: true },
    });

    const recentMatchIds = recentHistory.map((h) => h.match_id);

    const recentOpponentIds = recentMatchIds.length > 0
      ? (await prisma.match_players.findMany({
          where: {
            match_id: { in: recentMatchIds },
            user_id: { not: me.id },
          },
          select: { user_id: true },
        })).map((p) => p.user_id)
      : [];

    const excludeIds = [me.id, ...recentOpponentIds];

    const candidates = await prisma.users.findMany({
      where: {
        is_active: true,
        role: "player",
        id: { notIn: excludeIds },
        mmr: { gte: me.mmr - mmrRange, lte: me.mmr + mmrRange },
        ...(filterZone && { zone: me.zone }),
      },
      select: {
        id: true,
        name: true,
        photo_url: true,
        level: true,
        zone: true,
        mmr: true,
      },
    });

    const rivals = candidates
      .map((c) => ({ ...c, mmr_diff: Math.abs(c.mmr - me.mmr) }))
      .sort((a, b) => a.mmr_diff - b.mmr_diff)
      .slice(0, limit)
      .map(({ mmr_diff, ...c }) => ({ ...c, mmr_diff }));

    return NextResponse.json({
      requester: { mmr: me.mmr, zone: me.zone },
      filters: { mmr_range: mmrRange, zone: filterZone ? me.zone : null },
      total: rivals.length,
      rivals,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener sugerencias de rivales", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
