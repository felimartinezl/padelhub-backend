import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return null;
  const user = await prisma.users.findUnique({
    where: { id: adminId },
    select: { id: true, role: true },
  });
  return user?.role === "admin" ? user : null;
}

const VALID_LEVELS = ["primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "septima_mas"];
const VALID_ROLES = ["player", "admin"];

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await context.params;
    const user = await prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        rut: true,
        dv_rut: true,
        name: true,
        phone: true,
        zone: true,
        level: true,
        mmr: true,
        role: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        _count: { select: { matches: true, match_players: true } },
      },
    });

    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    return NextResponse.json(user);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener usuario", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await context.params;
    const { name, zone, level, role, is_active } = await request.json();

    if (level && !VALID_LEVELS.includes(level)) {
      return NextResponse.json({ error: "Nivel inválido" }, { status: 400 });
    }
    if (role && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    const user = await prisma.users.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(zone && { zone }),
        ...(level && { level }),
        ...(role && { role }),
        ...(is_active !== undefined && { is_active }),
        updated_at: new Date(),
      },
      select: {
        id: true,
        rut: true,
        dv_rut: true,
        name: true,
        phone: true,
        zone: true,
        level: true,
        mmr: true,
        role: true,
        is_active: true,
        updated_at: true,
      },
    });

    return NextResponse.json(user);
  } catch (error: any) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Error al actualizar usuario", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await context.params;

    if (id === admin.id) {
      return NextResponse.json(
        { error: "No puedes eliminar tu propio usuario" },
        { status: 400 }
      );
    }

    await prisma.users.delete({ where: { id } });
    return NextResponse.json({ message: "Usuario eliminado correctamente" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: "No se puede eliminar: el usuario tiene partidos u otros datos asociados" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Error al eliminar usuario", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,x-admin-id",
    },
  });
}
