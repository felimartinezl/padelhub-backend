import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/users/{rut}/ratings
export async function GET(
  _request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const num = parseInt(rut);
    if (isNaN(num)) {
      return NextResponse.json({ error: "RUT inválido" }, { status: 400 });
    }

    const user = await prisma.users.findFirst({ where: { rut: num }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const ratings = await prisma.match_ratings.findMany({
      where: { rated_id: user.id },
      select: {
        stars: true,
        created_at: true,
        matches: { select: { id: true, club: true, match_date: true } },
      },
      orderBy: { created_at: "desc" },
    });

    if (ratings.length === 0) {
      return NextResponse.json({
        total: 0,
        average: null,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recent: [],
      });
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of ratings) {
      distribution[r.stars]++;
      sum += r.stars;
    }
    const average = Math.round((sum / ratings.length) * 10) / 10;

    return NextResponse.json({
      total: ratings.length,
      average,
      distribution,
      recent: ratings.slice(0, 10).map((r) => ({
        stars: r.stars,
        created_at: r.created_at,
        match: {
          id: r.matches.id,
          club: r.matches.club,
          match_date: r.matches.match_date,
        },
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener valoraciones", details: error.message },
      { status: 500 }
    );
  }
}
