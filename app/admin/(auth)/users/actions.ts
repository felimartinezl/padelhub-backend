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
