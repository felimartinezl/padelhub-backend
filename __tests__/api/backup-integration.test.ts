import { generateToken } from "@/lib/auth";

// ── Mock de Prisma ───────────────────────────────────────────────────────────
jest.mock("@/lib/prisma", () => ({
  prisma: {
    users:          { findMany: jest.fn() },
    matches:        { findMany: jest.fn() },
    match_players:  { findMany: jest.fn() },
    match_results:  { findMany: jest.fn() },
    mmr_history:    { findMany: jest.fn() },
    refresh_tokens: { findMany: jest.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET as backupHandler } from "@/app/api/backup/route";

const EXPECTED_MODELS = [
  "users",
  "matches",
  "match_players",
  "match_results",
  "mmr_history",
  "refresh_tokens",
] as const;

const ADMIN_ID    = "00000000-0000-0000-0000-000000000001";
const PLAYER_ID   = "00000000-0000-0000-0000-000000000002";
const adminToken  = generateToken(ADMIN_ID,  "admin");
const playerToken = generateToken(PLAYER_ID, "player");

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/backup", { method: "GET", headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Cada tabla devuelve al menos un registro
  (prisma.users          as any).findMany.mockResolvedValue([{ id: "u1", name: "Test" }]);
  (prisma.matches        as any).findMany.mockResolvedValue([{ id: "m1", club: "Club" }]);
  (prisma.match_players  as any).findMany.mockResolvedValue([{ id: "mp1" }]);
  (prisma.match_results  as any).findMany.mockResolvedValue([{ id: "mr1" }]);
  (prisma.mmr_history    as any).findMany.mockResolvedValue([{ id: "mmr1" }]);
  (prisma.refresh_tokens as any).findMany.mockResolvedValue([{ id: "rt1" }]);
});

// ════════════════════════════════════════════════════════════════════════════
// BI-01 | Endpoint GET /api/backup retorna descarga
//
// Pre-condición : BD con datos; token de admin válido
// Pasos         : GET /api/backup con Authorization: Bearer <adminToken>
// Resultado     : HTTP 200; Content-Disposition: attachment; JSON parseable
// ════════════════════════════════════════════════════════════════════════════
describe("BI-01 | GET /api/backup retorna descarga con token admin", () => {
  it("retorna HTTP 200 con header Content-Disposition: attachment y body JSON parseable", async () => {
    const req = makeRequest({ Authorization: `Bearer ${adminToken}` });
    const res = await backupHandler(req);

    console.log("\n[BI-01] Status:", res.status);
    console.log("[BI-01] Content-Disposition:", res.headers.get("Content-Disposition"));

    expect(res.status).toBe(200);

    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(/filename="backup_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json"/);

    const text   = await res.text();
    const parsed = JSON.parse(text);
    console.log("[BI-01] JSON parseable:", true);
    console.log("[BI-01] backup_info.type:", parsed.backup_info?.type);

    expect(parsed).toHaveProperty("backup_info");
    expect(parsed).toHaveProperty("database");
    expect(parsed.backup_info.type).toBe("MANUAL_HTTP_BACKUP");
    expect(parsed.backup_info.database_provider).toBe("PostgreSQL (Supabase)");
  });

  it("retorna 403 si el token es de un player (no admin)", async () => {
    const req = makeRequest({ Authorization: `Bearer ${playerToken}` });
    const res = await backupHandler(req);

    console.log("\n[BI-01] Status con token player:", res.status);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("administradores");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BI-02 | Backup incluye todas las tablas
//
// Pre-condición : BD con al menos 1 registro por tabla
// Pasos         : GET /api/backup y parsear response JSON
// Resultado     : database tiene las 6 claves esperadas; cada una no vacía
// ════════════════════════════════════════════════════════════════════════════
describe("BI-02 | Backup incluye todas las tablas", () => {
  it("database contiene las 6 claves esperadas con registros no vacíos", async () => {
    const req = makeRequest({ Authorization: `Bearer ${adminToken}` });
    const res = await backupHandler(req);

    const { database } = JSON.parse(await res.text());

    console.log("\n[BI-02] Claves en database:", Object.keys(database));

    expect(res.status).toBe(200);

    for (const model of EXPECTED_MODELS) {
      console.log(`[BI-02]   ${model}: ${database[model]?.length} registro(s)`);
      expect(database).toHaveProperty(model);
      expect(Array.isArray(database[model])).toBe(true);
      expect(database[model].length).toBeGreaterThan(0);
    }

    expect(Object.keys(database)).toHaveLength(EXPECTED_MODELS.length);
  });

  it("llama findMany en los 6 modelos exactamente una vez cada uno", async () => {
    const req = makeRequest({ Authorization: `Bearer ${adminToken}` });
    await backupHandler(req);

    for (const model of EXPECTED_MODELS) {
      expect((prisma[model as keyof typeof prisma] as any).findMany)
        .toHaveBeenCalledTimes(1);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BI-03 | Acceso a /api/backup sin autenticación
//
// Pre-condición : sin header Authorization
// Pasos         : GET /api/backup
// Resultado     : HTTP 401; sin datos expuestos; sin descarga iniciada
// ════════════════════════════════════════════════════════════════════════════
describe("BI-03 | GET /api/backup sin token → 401", () => {
  it("retorna 401 sin header Authorization", async () => {
    const req = makeRequest();   // sin Authorization
    const res = await backupHandler(req);

    const body = await res.json();

    console.log("\n[BI-03] Status:", res.status);
    console.log("[BI-03] Error:", body.error);
    console.log("[BI-03] Content-Disposition presente:", !!res.headers.get("Content-Disposition"));

    expect(res.status).toBe(401);
    expect(body.error).toBe("No autorizado");
  });

  it("no expone datos (sin propiedad database en la respuesta)", async () => {
    const req  = makeRequest();
    const body = await (await backupHandler(req)).json();

    expect(body).not.toHaveProperty("database");
    expect(body).not.toHaveProperty("backup_info");
  });

  it("no llama findMany en ningún modelo cuando no hay token", async () => {
    const req = makeRequest();
    await backupHandler(req);

    for (const model of EXPECTED_MODELS) {
      expect((prisma[model as keyof typeof prisma] as any).findMany)
        .not.toHaveBeenCalled();
    }
  });
});
