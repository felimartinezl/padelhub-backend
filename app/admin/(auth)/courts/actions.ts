"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function createCourtAction(_prevState: any, formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();
  const zone = (formData.get("zone") as string)?.trim();
  const surface = formData.get("surface") as string;

  if (!name || !address || !zone || !surface) {
    return { error: "Todos los campos son obligatorios" };
  }

  try {
    await prisma.courts.create({
      data: { name, address, zone, surface: surface as any },
    });
  } catch {
    return { error: "Error al crear la cancha" };
  }

  redirect("/admin/courts");
}

export async function deleteCourtAction(formData: FormData) {
  const court_id = formData.get("court_id") as string;
  try {
    await prisma.courts.delete({ where: { id: court_id } });
  } catch {}
  revalidatePath("/admin/courts");
}
