import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const zone = searchParams.get("zone")?.trim() || null;
    const level = searchParams.get("level")?.trim() || null;
    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);

    const where: Record<string, unknown> = {
      is_active: true,
      role: "player",
    };

    if (zone) where.zone = zone;
    if (level) where.level = level;

    const players = await prisma.users.findMany({
      where,
      orderBy: { mmr: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        photo_url: true,
        level: true,
        zone: true,
        mmr: true,
        _count: { select: { mmr_history: true } },
      },
    });

    const ranked = players.map((p, index) => ({
      rank: index + 1,
      id: p.id,
      name: p.name,
      photo_url: p.photo_url ?? null,
      level: p.level,
      zone: p.zone,
      mmr: p.mmr,
      matches_played: p._count.mmr_history,
    }));

    return NextResponse.json({
      scope: zone ? "zone" : "national",
      zone: zone ?? null,
      level: level ?? null,
      total: ranked.length,
      players: ranked,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener el leaderboard", details: error.message },
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
