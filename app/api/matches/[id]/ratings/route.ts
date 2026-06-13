import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushNotifications } from "@/lib/notifications";

// GET /api/matches/{id}/ratings?rater_id={userId}
// Devuelve a quién falta valorar y a quién ya se valoró
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: match_id } = await context.params;
    const { searchParams } = new URL(request.url);
    const rater_id = searchParams.get("rater_id");

    if (!rater_id) {
      return NextResponse.json({ error: "El parámetro rater_id es obligatorio" }, { status: 400 });
    }

    const match = await prisma.matches.findUnique({
      where: { id: match_id },
      select: {
        status: true,
        club: true,
        match_players: {
          where: { status: "confirmed" },
          select: { user_id: true, team: true, users: { select: { id: true, name: true } } },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
    }

    const isMember = match.match_players.some((p) => p.user_id === rater_id);
    if (!isMember) {
      return NextResponse.json(
        { error: "Solo los jugadores confirmados del partido pueden ver las valoraciones" },
        { status: 403 }
      );
    }

    const can_rate = match.status === "finished";

    const otherPlayers = match.match_players.filter((p) => p.user_id !== rater_id);

    const existingRatings = await prisma.match_ratings.findMany({
      where: { match_id, rater_id },
      select: { rated_id: true, stars: true },
    });
    const ratedMap = new Map(existingRatings.map((r) => [r.rated_id, r.stars]));

    const players_to_rate = otherPlayers
      .filter((p) => !ratedMap.has(p.user_id))
      .map((p) => ({ id: p.users.id, name: p.users.name, team: p.team }));

    const already_rated = otherPlayers
      .filter((p) => ratedMap.has(p.user_id))
      .map((p) => ({ id: p.users.id, name: p.users.name, team: p.team, stars: ratedMap.get(p.user_id)! }));

    return NextResponse.json({
      can_rate,
      has_rated_all: can_rate && players_to_rate.length === 0,
      players_to_rate,
      already_rated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener valoraciones", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/matches/{id}/ratings
// Body: { rater_id, ratings: [{ rated_id, stars }] }
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: match_id } = await context.params;
    const body = await request.json();
    const { rater_id, ratings } = body as {
      rater_id: string;
      ratings: { rated_id: string; stars: number }[];
    };

    if (!rater_id || !Array.isArray(ratings) || ratings.length === 0) {
      return NextResponse.json(
        { error: "Se requieren rater_id y un array ratings no vacío" },
        { status: 400 }
      );
    }

    // Validar estrellas
    for (const r of ratings) {
      if (!r.rated_id || !Number.isInteger(r.stars) || r.stars < 1 || r.stars > 5) {
        return NextResponse.json(
          { error: "Cada valoración debe incluir rated_id y stars (entero del 1 al 5)" },
          { status: 400 }
        );
      }
      if (r.rated_id === rater_id) {
        return NextResponse.json({ error: "No puedes valorarte a ti mismo" }, { status: 400 });
      }
    }

    const match = await prisma.matches.findUnique({
      where: { id: match_id },
      select: {
        status: true,
        club: true,
        match_players: {
          where: { status: "confirmed" },
          select: { user_id: true },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
    }

    if (match.status !== "finished") {
      return NextResponse.json(
        { error: "Solo se puede valorar en partidos finalizados" },
        { status: 400 }
      );
    }

    const confirmedIds = new Set(match.match_players.map((p) => p.user_id));

    if (!confirmedIds.has(rater_id)) {
      return NextResponse.json(
        { error: "Solo los jugadores confirmados del partido pueden valorar" },
        { status: 403 }
      );
    }

    for (const r of ratings) {
      if (!confirmedIds.has(r.rated_id)) {
        return NextResponse.json(
          { error: `El jugador ${r.rated_id} no es participante confirmado del partido` },
          { status: 400 }
        );
      }
    }

    // Crear valoraciones (skipDuplicates evita error si ya existía)
    const { count } = await prisma.match_ratings.createMany({
      data: ratings.map((r) => ({
        match_id,
        rater_id,
        rated_id: r.rated_id,
        stars: r.stars,
      })),
      skipDuplicates: true,
    });

    // Notificar a cada jugador valorado
    for (const r of ratings) {
      sendPushNotifications([r.rated_id], {
        title: "Nueva valoración recibida",
        body: `Recibiste ${r.stars} ${"★".repeat(r.stars)} en el partido de ${match.club}`,
        data: { match_id, type: "match_rating_received", stars: r.stars },
      }).catch(() => {});
    }

    return NextResponse.json({ submitted: count }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al registrar las valoraciones", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
