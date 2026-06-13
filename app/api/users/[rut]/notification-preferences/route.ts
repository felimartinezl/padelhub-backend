import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_PREF_KEYS, resolvePreferences, type NotificationPrefKey } from "@/lib/notifications";

async function findUser(rut: string) {
  const num = parseInt(rut);
  if (isNaN(num)) return null;
  return prisma.users.findFirst({
    where: { rut: num },
    select: { id: true, notification_preferences: true },
  });
}

// GET /api/users/{rut}/notification-preferences
export async function GET(
  _request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const user = await findUser(rut);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      preferences: resolvePreferences(user.notification_preferences),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener preferencias", details: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/users/{rut}/notification-preferences
// Body: { match_invitation?: bool, chat_message?: bool, ... }
export async function PATCH(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut } = await context.params;
    const user = await findUser(rut);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const body = await request.json();

    const invalid = Object.keys(body).filter(
      (k) => !(NOTIFICATION_PREF_KEYS as readonly string[]).includes(k)
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Claves inválidas: ${invalid.join(", ")}. Permitidas: ${NOTIFICATION_PREF_KEYS.join(", ")}` },
        { status: 400 }
      );
    }

    const nonBool = Object.entries(body).filter(([, v]) => typeof v !== "boolean");
    if (nonBool.length > 0) {
      return NextResponse.json(
        { error: "Todos los valores deben ser booleanos (true/false)" },
        { status: 400 }
      );
    }

    const current = resolvePreferences(user.notification_preferences);
    const updated: Record<NotificationPrefKey, boolean> = { ...current };
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (key in body) updated[key] = body[key] as boolean;
    }

    await prisma.users.update({
      where: { id: user.id },
      data: { notification_preferences: updated, updated_at: new Date() },
    });

    return NextResponse.json({ preferences: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al actualizar preferencias", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
