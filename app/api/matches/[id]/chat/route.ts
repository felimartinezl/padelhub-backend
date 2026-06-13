import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushNotifications } from "@/lib/notifications";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_CONTENT_LENGTH = 500;
const ACTIVE_STATUSES = ["open", "confirmed", "in_progress"];

async function getConfirmedPlayer(match_id: string, user_id: string) {
  return prisma.match_players.findFirst({
    where: { match_id, user_id, status: "confirmed" },
    select: { user_id: true },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: match_id } = await context.params;
    const { searchParams } = new URL(request.url);

    const user_id = searchParams.get("user_id");
    if (!user_id) {
      return NextResponse.json({ error: "El parámetro user_id es obligatorio" }, { status: 400 });
    }

    const participant = await getConfirmedPlayer(match_id, user_id);
    if (!participant) {
      return NextResponse.json(
        { error: "Solo los jugadores confirmados del partido pueden ver el chat" },
        { status: 403 }
      );
    }

    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);
    const before = searchParams.get("before") ?? undefined;

    const messages = await prisma.match_messages.findMany({
      where: {
        match_id,
        ...(before && { created_at: { lt: new Date(before) } }),
      },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        content: true,
        created_at: true,
        users: { select: { id: true, name: true, photo_url: true } },
      },
    });

    const ordered = messages.reverse();
    const oldest = ordered[0]?.created_at ?? null;

    return NextResponse.json({
      match_id,
      total: ordered.length,
      has_more: ordered.length === limit,
      next_before: oldest,
      messages: ordered.map((m) => ({
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        author: {
          id: m.users.id,
          name: m.users.name,
          photo_url: m.users.photo_url ?? null,
        },
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener los mensajes", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: match_id } = await context.params;
    const { user_id, content } = await request.json();

    if (!user_id || !content) {
      return NextResponse.json(
        { error: "Los campos user_id y content son obligatorios" },
        { status: 400 }
      );
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "El mensaje no puede estar vacío" }, { status: 400 });
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `El mensaje no puede superar los ${MAX_CONTENT_LENGTH} caracteres` },
        { status: 400 }
      );
    }

    const match = await prisma.matches.findUnique({
      where: { id: match_id },
      select: { status: true, club: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
    }

    if (!ACTIVE_STATUSES.includes(match.status)) {
      return NextResponse.json(
        { error: "El chat solo está disponible en partidos activos" },
        { status: 400 }
      );
    }

    const participant = await getConfirmedPlayer(match_id, user_id);
    if (!participant) {
      return NextResponse.json(
        { error: "Solo los jugadores confirmados del partido pueden enviar mensajes" },
        { status: 403 }
      );
    }

    const [message, sender] = await Promise.all([
      prisma.match_messages.create({
        data: { match_id, user_id, content: trimmed },
        select: {
          id: true,
          content: true,
          created_at: true,
          users: { select: { id: true, name: true, photo_url: true } },
        },
      }),
      prisma.users.findUnique({ where: { id: user_id }, select: { name: true } }),
    ]);

    const otherPlayers = await prisma.match_players.findMany({
      where: { match_id, status: "confirmed", user_id: { not: user_id } },
      select: { user_id: true },
    });

    sendPushNotifications(
      otherPlayers.map((p) => p.user_id),
      {
        title: `Chat — ${match.club}`,
        body: `${sender?.name ?? "Jugador"}: ${trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed}`,
        data: { match_id, type: "chat_message", message_id: message.id },
      }
    ).catch(() => {});

    return NextResponse.json(
      {
        id: message.id,
        content: message.content,
        created_at: message.created_at,
        author: {
          id: message.users.id,
          name: message.users.name,
          photo_url: message.users.photo_url ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al enviar el mensaje", details: error.message },
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
