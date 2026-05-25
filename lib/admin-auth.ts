import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";

export async function getAdminSession() {
  const cookieStore = await cookies();
  const adminId = cookieStore.get("admin_id")?.value;
  if (!adminId) return null;

  const user = await prisma.users.findUnique({
    where: { id: adminId },
    select: { id: true, name: true, role: true },
  });

  if (!user || user.role !== "admin") return null;
  return user;
}

export async function requireAdmin() {
  const user = await getAdminSession();
  if (!user) redirect("/admin/login");
  return user;
}
