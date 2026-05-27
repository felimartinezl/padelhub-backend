import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_PLAYERS: Record<string, number> = { doubles: 4, singles: 2 };
const VALID_STATUSES = ["accepted", "declined"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user_id, status } = await request.json();

    if (!user_id || !status) {
      return NextResponse.json(
        { error: "Los campos user_id y status son obligatorios" },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "El estado debe ser 'accepted' o 'declined'" },
        { status: 400 }
      );
    }

    const invitation = await prisma.match_invitations.findUnique({ where: { id } });

    if (!invitation) {
      return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
    }

    if (invitation.user_id !== user_id) {
      return NextResponse.json(
        { error: "No tienes permiso para responder esta invitación" },
        { status: 403 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Esta invitación ya fue respondida" },
        { status: 400 }
      );
    }

    if (status === "declined") {
      const updated = await prisma.match_invitations.update({
        where: { id },
        data: { status: "declined", responded_at: new Date() },
      });
      return NextResponse.json({ message: "Invitación rechazada", invitation: updated });
    }

    // Aceptar: unirse al partido
    const match = await prisma.matches.findUnique({
      where: { id: invitation.match_id },
      include: { match_players: { where: { status: "confirmed" } } },
    });

    if (!match || match.status !== "open") {
      return NextResponse.json(
        { error: "El partido ya no está disponible" },
        { status: 400 }
      );
    }

    const maxPlayers = MAX_PLAYERS[match.format] ?? 4;

    if (match.match_players.length >= maxPlayers) {
      return NextResponse.json({ error: "El partido ya está completo" }, { status: 400 });
    }

    const team = match.match_players.length % 2 === 0 ? "team_a" : "team_b";

    await prisma.$transaction([
      prisma.match_players.create({
        data: {
          match_id: invitation.match_id,
          user_id,
          team,
          status: "confirmed",
        },
      }),
      prisma.match_invitations.update({
        where: { id },
        data: { status: "accepted", responded_at: new Date() },
      }),
    ]);

    const newCount = match.match_players.length + 1;
    let matchStatus = match.status;
    if (newCount >= maxPlayers) {
      await prisma.matches.update({
        where: { id: match.id },
        data: { status: "confirmed" },
      });
      matchStatus = "confirmed";
    }

    const updatedPlayers = await prisma.match_players.findMany({
      where: { match_id: invitation.match_id, status: "confirmed" },
      include: {
        users: { select: { id: true, name: true, level: true, photo_url: true } },
      },
    });

    return NextResponse.json({
      message: "Te has unido al partido correctamente",
      match: {
        id: match.id,
        club: match.club,
        format: match.format,
        status: matchStatus,
        match_date: match.match_date,
        match_time: match.match_time,
        is_full: newCount >= maxPlayers,
        player_count: newCount,
        max_players: maxPlayers,
        players: updatedPlayers.map((mp) => ({
          ...mp.users,
          team: mp.team,
        })),
      },
      assigned_team: team,
    }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Ya eres parte de este partido" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Error al responder la invitación", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
