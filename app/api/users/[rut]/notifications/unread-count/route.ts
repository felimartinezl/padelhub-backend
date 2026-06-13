import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/users/{rut}/notifications/unread-count
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

    const unread_count = await prisma.notifications.count({
      where: { user_id: user.id, read_at: null },
    });

    return NextResponse.json({ unread_count });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener contador", details: error.message },
      { status: 500 }
    );
  }
}
