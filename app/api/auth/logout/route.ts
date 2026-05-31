import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json({ error: "refreshToken requerido" }, { status: 400 });
    }

    // Eliminar el refresh token de la BD (revocación)
    const deleted = await prisma.refresh_tokens.deleteMany({
      where: { token: refreshToken },
    });

    if (deleted.count === 0) {
      // Token ya revocado o inexistente — igual se responde OK (logout idempotente)
      return NextResponse.json({ message: "Sesión cerrada" });
    }

    return NextResponse.json({ message: "Sesión cerrada correctamente" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al cerrar sesión", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
