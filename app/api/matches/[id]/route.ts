import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchWindow } from "@/lib/match-window";

const MAX_PLAYERS: Record<string, number> = { doubles: 4, singles: 2 };

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const match = await prisma.matches.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, level: true, zone: true } },
        match_players: {
          where: { status: "confirmed" },
          include: {
            users: { select: { id: true, name: true, level: true, photo_url: true } },
          },
        },
        match_results: true,
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
    }

    const maxPlayers = MAX_PLAYERS[match.format] ?? 4;
    const playerCount = match.match_players.length;

    return NextResponse.json({
      id: match.id,
      club: match.club,
      format: match.format,
      status: match.status,
      match_date: match.match_date,
      match_time: match.match_time,
      zone: match.users.zone,
      organizer: match.users,
      players: match.match_players.map((mp) => ({
        ...mp.users,
        team: mp.team,
        joined: mp.joined_at,
      })),
      max_players: maxPlayers,
      player_count: playerCount,
      spots_left: maxPlayers - playerCount,
      is_full: playerCount >= maxPlayers,
      result: match.match_results ?? null,
      match_window: getMatchWindow(match.match_date, match.match_time),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener el partido", details: error.message },
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
