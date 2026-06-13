import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/users/{rut}/notifications/{id}  →  marca una como leída
export async function PATCH(
  _request: Request,
  context: { params: Promise<{ rut: string; id: string }> }
) {
  try {
    const { rut, id } = await context.params;
    const num = parseInt(rut);
    if (isNaN(num)) {
      return NextResponse.json({ error: "RUT inválido" }, { status: 400 });
    }

    const user = await prisma.users.findFirst({ where: { rut: num }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const notification = await prisma.notifications.findUnique({
      where: { id },
      select: { id: true, user_id: true, read_at: true },
    });

    if (!notification) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }

    if (notification.user_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (notification.read_at) {
      return NextResponse.json({ id, already_read: true });
    }

    await prisma.notifications.update({
      where: { id },
      data: { read_at: new Date() },
    });

    return NextResponse.json({ id, read: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al marcar notificación", details: error.message },
      { status: 500 }
    );
  }
}
