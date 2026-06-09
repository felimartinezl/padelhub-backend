import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;

    if (!rut) {
      return NextResponse.json(
        { error: "El RUT es requerido en la URL" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);

    const player = await prisma.users.findFirst({
      where: { rut: parseInt(rut) },
      select: { id: true },
    });

    if (!player) {
      return NextResponse.json(
        { error: `No se encontró ningún jugador con el RUT ${rut}` },
        { status: 404 }
      );
    }

    const history = await prisma.mmr_history.findMany({
      where: { user_id: player.id },
      orderBy: { calculated_at: "desc" },
      take: limit,
      select: {
        id: true,
        mmr_before: true,
        mmr_after: true,
        delta: true,
        calculated_at: true,
        matches: {
          select: {
            id: true,
            club: true,
            format: true,
            match_date: true,
          },
        },
      },
    });

    const entries = history.map((h) => ({
      id: h.id,
      mmr_before: h.mmr_before,
      mmr_after: h.mmr_after,
      delta: h.delta,
      calculated_at: h.calculated_at,
      match: {
        id: h.matches.id,
        club: h.matches.club,
        format: h.matches.format,
        match_date: h.matches.match_date,
      },
    }));

    return NextResponse.json({
      total: entries.length,
      limit,
      history: entries,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener el historial de MMR", details: error.message },
      { status: 500 }
    );
  }
}
