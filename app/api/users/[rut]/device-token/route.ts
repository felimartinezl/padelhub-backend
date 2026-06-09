import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Expo from "expo-server-sdk";

const VALID_PLATFORMS = ["ios", "android"];

export async function POST(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const { token, platform } = await request.json();

    if (!token || !platform) {
      return NextResponse.json(
        { error: "Los campos token y platform son obligatorios" },
        { status: 400 }
      );
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: "El campo platform debe ser 'ios' o 'android'" },
        { status: 400 }
      );
    }

    if (!Expo.isExpoPushToken(token)) {
      return NextResponse.json(
        { error: "El token no es un Expo Push Token válido" },
        { status: 400 }
      );
    }

    const user = await prisma.users.findFirst({
      where: { rut: parseInt(rut) },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: `No se encontró ningún jugador con el RUT ${rut}` },
        { status: 404 }
      );
    }

    await prisma.device_tokens.upsert({
      where: { token },
      create: { user_id: user.id, token, platform },
      update: { user_id: user.id, platform },
    });

    return NextResponse.json(
      { message: "Token de dispositivo registrado correctamente" },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al registrar el token", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "El campo token es obligatorio" },
        { status: 400 }
      );
    }

    const user = await prisma.users.findFirst({
      where: { rut: parseInt(rut) },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: `No se encontró ningún jugador con el RUT ${rut}` },
        { status: 404 }
      );
    }

    await prisma.device_tokens.deleteMany({
      where: { user_id: user.id, token },
    });

    return NextResponse.json({ message: "Token eliminado correctamente" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al eliminar el token", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
