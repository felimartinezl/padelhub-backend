import dotenv from "dotenv";
import path from "path";

// Cargar .env.test antes de importar Prisma para que use la DB de prueba
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const E2E_USER = {
  id:       "00000000-0000-0000-0000-e2e000000001",
  rut:      99_000_001,
  dv_rut:   "k",
  name:     "E2E Test Player",
  phone:    "+56911111111",
  password: "E2ePassword!1",
  level:    "tercera" as const,
  zone:     "Santiago",
  mmr:      1000,
  role:     "player",
};

// 3 jugadores adicionales para pruebas de matches (ME-01/ME-02)
export const E2E_PLAYERS = [
  { id: "00000000-0000-0000-0000-e2e000000002", rut: 99_000_002, dv_rut: "k", name: "E2E Player A2", phone: "+56922222222", level: "tercera" as const, zone: "Santiago", mmr: 1000, role: "player" },
  { id: "00000000-0000-0000-0000-e2e000000003", rut: 99_000_003, dv_rut: "k", name: "E2E Player B1", phone: "+56933333333", level: "tercera" as const, zone: "Santiago", mmr: 1000, role: "player" },
  { id: "00000000-0000-0000-0000-e2e000000004", rut: 99_000_004, dv_rut: "k", name: "E2E Player B2", phone: "+56944444444", level: "tercera" as const, zone: "Santiago", mmr: 1000, role: "player" },
];

// Admin para pruebas de backup (BE-01, BE-02)
export const E2E_ADMIN = {
  id:       "00000000-0000-0000-0000-e2e000000010",
  rut:      99_000_010,
  dv_rut:   "k",
  name:     "E2E Admin User",
  phone:    "+56910101010",
  password: "E2eAdminPwd!1",
  level:    "tercera" as const,
  zone:     "Santiago",
  mmr:      1500,
  role:     "admin",
};

export default async function globalSetup() {
  // DIRECT_URL evita PgBouncer — los prepared statements de Prisma no son
  // compatibles con el pooler de Supabase en modo transaction.
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });
  try {
    const password_hash = await bcrypt.hash(E2E_USER.password, 10);

    await prisma.users.upsert({
      where:  { id: E2E_USER.id },
      update: { password_hash },
      create: {
        id:            E2E_USER.id,
        rut:           E2E_USER.rut,
        dv_rut:        E2E_USER.dv_rut,
        name:          E2E_USER.name,
        phone:         E2E_USER.phone,
        password_hash,
        level:         E2E_USER.level,
        zone:          E2E_USER.zone,
        mmr:           E2E_USER.mmr,
        role:          E2E_USER.role as any,
        is_active:     true,
      },
    });

    // Sembrar 3 jugadores adicionales para pruebas de matches
    for (const p of E2E_PLAYERS) {
      await prisma.users.upsert({
        where:  { id: p.id },
        update: {},
        create: {
          id:            p.id,
          rut:           p.rut,
          dv_rut:        p.dv_rut,
          name:          p.name,
          phone:         p.phone,
          password_hash,
          level:         p.level,
          zone:          p.zone,
          mmr:           p.mmr,
          role:          p.role as any,
          is_active:     true,
        },
      });
    }

    // Sembrar admin con su propio hash de contraseña
    const admin_hash = await bcrypt.hash(E2E_ADMIN.password, 10);
    await prisma.users.upsert({
      where:  { id: E2E_ADMIN.id },
      update: { password_hash: admin_hash },
      create: {
        id:            E2E_ADMIN.id,
        rut:           E2E_ADMIN.rut,
        dv_rut:        E2E_ADMIN.dv_rut,
        name:          E2E_ADMIN.name,
        phone:         E2E_ADMIN.phone,
        password_hash: admin_hash,
        level:         E2E_ADMIN.level,
        zone:          E2E_ADMIN.zone,
        mmr:           E2E_ADMIN.mmr,
        role:          E2E_ADMIN.role as any,
        is_active:     true,
      },
    });

    console.log("[E2E setup] Usuarios de prueba listos:", [E2E_USER.rut, ...E2E_PLAYERS.map(p => p.rut), E2E_ADMIN.rut]);
  } finally {
    await prisma.$disconnect();
  }
}
