import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";

const REFRESH_TOKEN_TTL_DAYS = 30;

export async function POST(request: Request) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json({ error: "refreshToken es obligatorio" }, { status: 400 });
    }

    const record = await prisma.refresh_tokens.findUnique({
      where: { token: refreshToken },
      select: { user_id: true, expires_at: true },
    });

    if (!record) {
      return NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 });
    }

    if (record.expires_at < new Date()) {
      return NextResponse.json({ error: "Token expirado" }, { status: 401 });
    }

    const user = await prisma.users.findUnique({
      where: { id: record.user_id },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 401 });
    }

    const newRefreshToken = crypto.randomUUID() + "-" + crypto.randomUUID();
    const expiresAt       = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.refresh_tokens.delete({ where: { token: refreshToken } }),
      prisma.refresh_tokens.create({
        data: { user_id: record.user_id, token: newRefreshToken, expires_at: expiresAt },
      }),
    ]);

    const accessToken = generateToken(record.user_id, user.role);

    return NextResponse.json({ accessToken, refreshToken: newRefreshToken }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al refrescar el token", details: error.message },
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
