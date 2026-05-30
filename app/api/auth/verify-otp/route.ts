import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rut, code } = body;

    if (!rut || !code) {
      return NextResponse.json(
        { error: "RUT y código son obligatorios" },
        { status: 400 }
      );
    }

    const user = await prisma.users.findFirst({
      where: { rut: parseInt(rut) },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Código inválido o expirado" },
        { status: 400 }
      );
    }

    const resetToken = await prisma.password_reset_tokens.findFirst({
      where: {
        user_id: user.id,
        code,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "Código inválido o expirado" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "Código verificado correctamente", valid: true },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al verificar el código", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
