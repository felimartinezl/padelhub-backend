import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { generateToken } from "@/lib/auth";

const REFRESH_TOKEN_TTL_DAYS = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rut, password } = body;

    if (!rut || !password) {
      return NextResponse.json(
        { error: "El RUT y la contraseña son obligatorios" },
        { status: 400 }
      );
    }

    const player = await prisma.users.findFirst({
      where: { rut: parseInt(rut) },
    });

    if (!player) {
      return NextResponse.json(
        { error: "RUT o contraseña incorrectos" },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, player.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "RUT o contraseña incorrectos" },
        { status: 401 }
      );
    }

    const accessToken  = generateToken(player.id, player.role);
    const refreshToken = crypto.randomUUID() + "-" + crypto.randomUUID();
    const expiresAt    = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refresh_tokens.create({
      data: { user_id: player.id, token: refreshToken, expires_at: expiresAt },
    });

    const { password_hash, ...userResponse } = player;

    return NextResponse.json(
      { message: "¡Inicio de sesión exitoso!", accessToken, refreshToken, user: userResponse },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error en el servidor al intentar iniciar sesión", details: error.message },
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
