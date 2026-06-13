import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushNotifications } from "@/lib/notifications";

const MAX_DAYS = 365;

async function verifyAdmin(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return null;
  const user = await prisma.users.findUnique({
    where: { id: adminId },
    select: { id: true, role: true },
  });
  return user?.role === "admin" ? user : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await context.params;
    const { days } = await request.json();

    if (!days || typeof days !== "number" || days < 1 || days > MAX_DAYS) {
      return NextResponse.json(
        { error: `El campo days es obligatorio y debe ser entre 1 y ${MAX_DAYS}` },
        { status: 400 }
      );
    }

    if (id === admin.id) {
      return NextResponse.json(
        { error: "No puedes suspenderte a ti mismo" },
        { status: 400 }
      );
    }

    const target = await prisma.users.findUnique({
      where: { id },
      select: { id: true, role: true, name: true },
    });

    if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (target.role === "admin") {
      return NextResponse.json(
        { error: "No puedes suspender a otro administrador" },
        { status: 403 }
      );
    }

    const suspendedUntil = new Date();
    suspendedUntil.setDate(suspendedUntil.getDate() + days);

    const updated = await prisma.users.update({
      where: { id },
      data: {
        is_active: false,
        suspended_until: suspendedUntil,
        updated_at: new Date(),
      },
      select: {
        id: true,
        name: true,
        is_active: true,
        suspended_until: true,
      },
    });

    sendPushNotifications([id], {
      title: "Cuenta suspendida",
      body: `Tu cuenta ha sido suspendida por ${days} día${days > 1 ? "s" : ""}. Acceso restaurado el ${suspendedUntil.toLocaleDateString("es-CL")}.`,
      data: { type: "account_suspended", suspended_until: suspendedUntil.toISOString() },
    }).catch(() => {});

    return NextResponse.json({
      message: `Usuario suspendido por ${days} día${days > 1 ? "s" : ""}`,
      user: updated,
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Error al suspender usuario", details: error.message },
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

    const updated = await prisma.users.update({
      where: { id },
      data: {
        is_active: true,
        suspended_until: null,
        updated_at: new Date(),
      },
      select: {
        id: true,
        name: true,
        is_active: true,
        suspended_until: true,
      },
    });

    sendPushNotifications([id], {
      title: "Cuenta reactivada",
      body: "Tu cuenta ha sido reactivada. Ya puedes acceder a PadelHub.",
      data: { type: "account_reactivated" },
    }).catch(() => {});

    return NextResponse.json({
      message: "Suspensión levantada correctamente",
      user: updated,
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Error al levantar la suspensión", details: error.message },
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
      "Access-Control-Allow-Headers": "Content-Type,Authorization,x-admin-id",
    },
  });
}
