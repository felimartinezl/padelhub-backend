import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchWindow } from "@/lib/match-window";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user_id } = await request.json();

    if (!user_id) {
      return NextResponse.json(
        { error: "El campo user_id es obligatorio" },
        { status: 400 }
      );
    }

    const match = await prisma.matches.findUnique({
      where: { id },
      include: { match_players: { where: { status: "confirmed" } } },
    });

    if (!match) {
      return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
    }

    if (match.organizer_id !== user_id) {
      return NextResponse.json(
        { error: "Solo el organizador puede iniciar el partido" },
        { status: 403 }
      );
    }

    if (!["open", "confirmed"].includes(match.status)) {
      return NextResponse.json(
        { error: `No se puede iniciar un partido con estado '${match.status}'` },
        { status: 400 }
      );
    }

    const window = getMatchWindow(match.match_date, match.match_time);
    if (!window.is_active) {
      return NextResponse.json(
        {
          error: "El partido solo puede iniciarse dentro de la ventana de ±15 minutos de su hora programada",
          match_window: window,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.matches.update({
      where: { id },
      data: { status: "in_progress", updated_at: new Date() },
    });

    return NextResponse.json({
      message: "¡Partido iniciado!",
      match: {
        id: updated.id,
        status: updated.status,
        club: updated.club,
        format: updated.format,
        match_date: updated.match_date,
        match_time: updated.match_time,
        player_count: match.match_players.length,
        match_window: window,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al iniciar el partido", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
