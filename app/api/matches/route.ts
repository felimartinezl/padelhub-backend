import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchWindow } from "@/lib/match-window";
import { requireAuth } from "@/lib/auth-middleware";

const MAX_PLAYERS: Record<string, number> = { doubles: 4, singles: 2 };

// ==========================================
// POST: Crear un nuevo partido
// ==========================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { organizer_id, club, format, match_date, match_time } = body;

    if (!organizer_id || !club || !match_date || !match_time) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios (organizer_id, club, match_date, match_time)" },
        { status: 400 }
      );
    }

    const fmt = format || "doubles";

    const newMatch = await prisma.matches.create({
      data: {
        organizer_id,
        club,
        format: fmt,
        status: "open",
        match_date: new Date(match_date),
        match_time: new Date(`${match_date}T${match_time}`),
      },
    });

    // Agrega al organizador como primer jugador (team_a, confirmado)
    await prisma.match_players.create({
      data: {
        match_id: newMatch.id,
        user_id:  organizer_id,
        team:     "team_a",
        status:   "confirmed",
      },
    });

    return NextResponse.json(
      { message: "¡Partido creado con éxito!", match: newMatch },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al crear el partido", details: error.message },
      { status: 500 }
    );
  }
}

// ==========================================
// GET: Listar partidos abiertos (filtros opcionales: zone, club, page, limit)
// ==========================================
function formatMatchRow(m: any) {
  const maxPlayers  = MAX_PLAYERS[m.format] ?? 4;
  const playerCount = m.match_players.length;
  const spotsLeft   = maxPlayers - playerCount;
  return {
    id:           m.id,
    club:         m.club,
    format:       m.format,
    status:       m.status,
    match_date:   m.match_date,
    match_time:   m.match_time,
    zone:         m.users.zone,
    organizer:    m.users,
    players:      m.match_players.map((mp: any) => ({
      ...mp.users,
      team:   mp.team,
      joined: mp.joined_at,
    })),
    max_players:  maxPlayers,
    player_count: playerCount,
    spots_left:   spotsLeft,
    is_full:      spotsLeft === 0,
    match_window: getMatchWindow(m.match_date, m.match_time),
  };
}

export async function GET(request: Request) {
  try {
    const { errorResponse } = requireAuth(request);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const zone    = searchParams.get("zone");
    const club    = searchParams.get("club");
    const status  = searchParams.get("status") ?? "open";
    const pageStr = searchParams.get("page");
    const limStr  = searchParams.get("limit");
    const page    = pageStr ? Math.max(1, parseInt(pageStr, 10)) : null;
    const limit   = limStr  ? Math.max(1, Math.min(100, parseInt(limStr, 10))) : null;

    const where: any = {
      status: status as any,
      ...(zone && { users: { zone: { equals: zone, mode: "insensitive" } } }),
      ...(club  && { club }),
    };

    const include = {
      users:         { select: { id: true, name: true, level: true, zone: true } },
      match_players: {
        where:   { status: "confirmed" as const },
        include: { users: { select: { id: true, name: true, level: true, photo_url: true } } },
      },
    };

    const orderBy = { match_date: "asc" as const };

    if (page !== null && limit !== null) {
      const [total, rows] = await Promise.all([
        prisma.matches.count({ where }),
        prisma.matches.findMany({ where, include, orderBy, skip: (page - 1) * limit, take: limit }),
      ]);
      return NextResponse.json({
        data:  rows.map(formatMatchRow),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    }

    const rows = await prisma.matches.findMany({ where, include, orderBy });
    return NextResponse.json(rows.map(formatMatchRow));
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener los partidos", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
