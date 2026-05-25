"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const rut = (formData.get("rut") as string)?.trim();
  const password = formData.get("password") as string;

  if (!rut || !password) {
    return { error: "RUT y contraseña son obligatorios" };
  }

  const user = await prisma.users.findFirst({ where: { rut: parseInt(rut) } });

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: "RUT o contraseña incorrectos" };
  }

  if (user.role !== "admin") {
    return { error: "No tienes permisos de administrador" };
  }

  const cookieStore = await cookies();
  cookieStore.set("admin_id", user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  redirect("/admin/users");
}
