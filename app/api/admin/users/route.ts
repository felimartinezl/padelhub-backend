import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return null;
  const user = await prisma.users.findUnique({
    where: { id: adminId },
    select: { id: true, role: true },
  });
  return user?.role === "admin" ? user : null;
}

export async function GET(request: Request) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
    const level = searchParams.get("level");
    const role = searchParams.get("role");
    const active = searchParams.get("active");

    const where: any = {};

    if (search) {
      const numSearch = parseInt(search);
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        ...(!isNaN(numSearch) ? [{ rut: numSearch }] : []),
      ];
    }
    if (level) where.level = level;
    if (role) where.role = role;
    if (active !== null) where.is_active = active === "true";

    const [users, total] = await Promise.all([
      prisma.users.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          rut: true,
          dv_rut: true,
          name: true,
          phone: true,
          zone: true,
          level: true,
          mmr: true,
          role: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
      }),
      prisma.users.count({ where }),
    ]);

    return NextResponse.json({
      data: users,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al obtener usuarios", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,x-admin-id",
    },
  });
}
