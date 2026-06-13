import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

async function findUser(rut: string) {
  const num = parseInt(rut);
  if (isNaN(num)) return null;
  return prisma.users.findFirst({ where: { rut: num }, select: { id: true } });
}

// GET /api/users/{rut}/notifications?limit=20&before=<ISO>
export async function GET(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const user = await findUser(rut);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);
    const before = searchParams.get("before") ?? undefined;

    const [notifications, unread_count] = await Promise.all([
      prisma.notifications.findMany({
        where: {
          user_id: user.id,
          ...(before && { created_at: { lt: new Date(before) } }),
        },
        orderBy: { created_at: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          body: true,
          type: true,
          data: true,
          read_at: true,
          created_at: true,
        },
      }),
      prisma.notifications.count({
        where: { user_id: user.id, read_at: null },
      }),
    ]);

    const last = notifications[notifications.length - 1];

    return NextResponse.json({
      unread_count,
      has_more: notifications.length === limit,
      next_before: last?.created_at ?? null,
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        data: n.data,
        read: n.read_at !== null,
        created_at: n.created_at,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener notificaciones", details: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/users/{rut}/notifications  →  marca todas como leídas
export async function PATCH(
  _request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const user = await findUser(rut);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const now = new Date();
    const { count } = await prisma.notifications.updateMany({
      where: { user_id: user.id, read_at: null },
      data: { read_at: now },
    });

    return NextResponse.json({ marked_read: count });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al marcar notificaciones", details: error.message },
      { status: 500 }
    );
  }
}
