"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function updateCourtAction(_prevState: any, formData: FormData) {
  const id = formData.get("court_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();
  const zone = (formData.get("zone") as string)?.trim();
  const surface = formData.get("surface") as string;
  const is_active = formData.get("is_active") === "true";

  if (!name || !address || !zone || !surface) {
    return { error: "Todos los campos son obligatorios" };
  }

  try {
    await prisma.courts.update({
      where: { id },
      data: { name, address, zone, surface: surface as any, is_active, updated_at: new Date() },
    });
  } catch {
    return { error: "Error al actualizar la cancha" };
  }

  redirect("/admin/courts");
}

export async function addScheduleAction(_prevState: any, formData: FormData) {
  const court_id = formData.get("court_id") as string;
  const day_of_week = parseInt(formData.get("day_of_week") as string);
  const open_time_str = formData.get("open_time") as string;
  const close_time_str = formData.get("close_time") as string;

  if (isNaN(day_of_week) || !open_time_str || !close_time_str) {
    return { error: "Todos los campos del horario son obligatorios" };
  }

  const open_time = new Date(`1970-01-01T${open_time_str}:00Z`);
  const close_time = new Date(`1970-01-01T${close_time_str}:00Z`);

  if (close_time <= open_time) {
    return { error: "La hora de cierre debe ser posterior a la de apertura" };
  }

  try {
    await prisma.court_schedules.upsert({
      where: { court_id_day_of_week: { court_id, day_of_week } },
      create: { court_id, day_of_week, open_time, close_time },
      update: { open_time, close_time, is_available: true },
    });
  } catch {
    return { error: "Error al guardar el horario" };
  }

  revalidatePath(`/admin/courts/${court_id}`);
  return { success: true };
}

export async function deleteScheduleAction(formData: FormData) {
  const schedule_id = formData.get("schedule_id") as string;
  const court_id = formData.get("court_id") as string;
  try {
    await prisma.court_schedules.delete({ where: { id: schedule_id } });
  } catch {}
  revalidatePath(`/admin/courts/${court_id}`);
}

export async function toggleScheduleAction(formData: FormData) {
  const schedule_id = formData.get("schedule_id") as string;
  const court_id = formData.get("court_id") as string;
  const current = formData.get("is_available") === "true";
  try {
    await prisma.court_schedules.update({
      where: { id: schedule_id },
      data: { is_available: !current },
    });
  } catch {}
  revalidatePath(`/admin/courts/${court_id}`);
}
