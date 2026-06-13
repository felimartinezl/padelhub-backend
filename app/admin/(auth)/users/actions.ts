"use server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function ensureAdmin() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function deleteUserAction(formData: FormData) {
  const admin = await ensureAdmin();
  const userId = formData.get("user_id") as string;

  if (userId === admin.id) {
    return;
  }

  try {
    await prisma.users.delete({ where: { id: userId } });
  } catch {
    // Fallo silencioso si hay FK constraints — el usuario tiene partidos asociados
  }

  revalidatePath("/admin/users");
}

export async function updateUserAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  await ensureAdmin();

  const userId = formData.get("user_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const zone = (formData.get("zone") as string)?.trim();
  const level = formData.get("level") as any;
  const role = formData.get("role") as any;
  const is_active = formData.get("is_active") === "true";

  if (!name || !zone || !level || !role) {
    return { error: "Todos los campos son obligatorios" };
  }

  try {
    await prisma.users.update({
      where: { id: userId },
      data: { name, zone, level, role, is_active, updated_at: new Date() },
    });
  } catch (e: any) {
    return { error: "Error al guardar los cambios: " + e.message };
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function suspendUserAction(
  _prevState: { error?: string; success?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const admin = await ensureAdmin();

  const userId = formData.get("user_id") as string;
  const days = parseInt(formData.get("days") as string, 10);

  if (!userId) return { error: "ID de usuario inválido" };
  if (isNaN(days) || days < 1 || days > 365) return { error: "Los días deben ser entre 1 y 365" };
  if (userId === admin.id) return { error: "No puedes suspenderte a ti mismo" };

  const target = await prisma.users.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target) return { error: "Usuario no encontrado" };
  if (target.role === "admin") return { error: "No puedes suspender a otro administrador" };

  const suspendedUntil = new Date();
  suspendedUntil.setDate(suspendedUntil.getDate() + days);

  await prisma.users.update({
    where: { id: userId },
    data: { is_active: false, suspended_until: suspendedUntil, updated_at: new Date() },
  });

  revalidatePath(`/admin/users/${userId}`);
  return { success: `Usuario suspendido por ${days} día${days > 1 ? "s" : ""} hasta el ${suspendedUntil.toLocaleDateString("es-CL")}` };
}

export async function liftSuspensionAction(formData: FormData): Promise<void> {
  await ensureAdmin();

  const userId = formData.get("user_id") as string;
  if (!userId) return;

  await prisma.users.update({
    where: { id: userId },
    data: { is_active: true, suspended_until: null, updated_at: new Date() },
  });

  revalidatePath(`/admin/users/${userId}`);
}
