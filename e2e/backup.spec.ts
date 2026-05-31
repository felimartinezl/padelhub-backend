import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as fs   from "fs";
import * as os   from "os";
import * as path from "path";
import { runBackupJob } from "../lib/backup";
import { E2E_USER, E2E_ADMIN } from "./global-setup";

const BACKUP_TABLES = [
  "users",
  "matches",
  "match_players",
  "match_results",
  "mmr_history",
  "refresh_tokens",
] as const;

function makePrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// BE-01 | Descarga manual y validación de contenido
//
// Pre-condición : BD con datos reales; admin autenticado
// Pasos         : 1.Autenticar admin 2.GET /api/backup
//                 3.Verificar archivo 4.Verificar conteos por tabla
// Resultado     : nombre correcto; conteos coinciden con BD; JSON bien formado
// ════════════════════════════════════════════════════════════════════════════
test.describe("BE-01 | Descarga manual y validación de contenido", () => {
  let adminToken = "";
  let prisma: PrismaClient;

  test.beforeAll(async ({ request }) => {
    prisma = makePrisma();

    // 1. Autenticarse como admin
    const loginRes = await request.post("/api/auth/login", {
      data: { rut: E2E_ADMIN.rut, password: E2E_ADMIN.password },
    });
    expect(loginRes.status()).toBe(200);
    adminToken = (await loginRes.json()).accessToken;
    console.log("[BE-01 setup] Admin autenticado OK");
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("nombre de archivo correcto y JSON bien formado", async ({ request }) => {
    // 2. GET /api/backup
    const res = await request.get("/api/backup", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    console.log("\n[BE-01] 2. Status:", res.status());
    expect(res.status()).toBe(200);

    // 3. Verificar Content-Disposition con nombre de archivo correcto
    const disposition = res.headers()["content-disposition"] ?? "";
    console.log("[BE-01] 3. Content-Disposition:", disposition);
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(
      /filename="backup_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json"/
    );

    // 4. JSON bien formado con estructura correcta
    const text   = await res.text();
    const backup = JSON.parse(text);   // lanza si no es JSON válido

    console.log("[BE-01]    backup_info.type:", backup.backup_info?.type);
    expect(backup.backup_info.type).toBe("MANUAL_HTTP_BACKUP");
    expect(backup.backup_info.database_provider).toBe("PostgreSQL (Supabase)");
    expect(backup.backup_info.backup_date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(backup).toHaveProperty("database");

    for (const table of BACKUP_TABLES) {
      expect(backup.database).toHaveProperty(table);
      expect(Array.isArray(backup.database[table])).toBe(true);
    }
  });

  test("conteos del backup coinciden con los registros en BD", async ({ request }) => {
    // GET backup → snapshot instantáneo
    const res    = await request.get("/api/backup", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const backup = JSON.parse(await res.text());

    console.log("\n[BE-01] 4. Comparando conteos backup vs BD:");

    // Comparar conteo por tabla de forma secuencial (mismo hilo — sin concurrencia)
    for (const table of BACKUP_TABLES) {
      const dbCount     = await (prisma[table] as any).count();
      const backupCount = (backup.database[table] as any[]).length;
      console.log(`[BE-01]    ${table}: BD=${dbCount}, backup=${backupCount}`);
      expect(backupCount).toBe(dbCount);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BE-02 | Restauración desde respaldo manual
//
// Pre-condición : backup generado; datos de prueba aislados por club
// Pasos         : 1.Parsear backup 2.Truncar registros de prueba
//                 3.Insertar con createMany 4.Comparar conteos pre/post
// Resultado     : conteos idénticos; relaciones foráneas íntegras
// ════════════════════════════════════════════════════════════════════════════
test.describe("BE-02 | Restauración desde respaldo manual", () => {
  const BE02_CLUB   = "E2E_BE02_RESTORE";
  const MATCH_COUNT = 3;

  let adminToken    = "";
  let prisma: PrismaClient;
  let backupMatches: any[];

  test.beforeAll(async ({ request }) => {
    prisma = makePrisma();

    // Login como admin para obtener el backup
    const loginRes = await request.post("/api/auth/login", {
      data: { rut: E2E_ADMIN.rut, password: E2E_ADMIN.password },
    });
    expect(loginRes.status()).toBe(200);
    adminToken = (await loginRes.json()).accessToken;

    // Sembrar partidos de prueba aislados por club único
    await prisma.matches.deleteMany({ where: { club: BE02_CLUB } });
    await prisma.matches.createMany({
      data: Array.from({ length: MATCH_COUNT }, () => ({
        organizer_id: E2E_USER.id,
        club:         BE02_CLUB,
        format:       "doubles",
        status:       "open",
        match_date:   new Date(),
        match_time:   new Date(),
      })),
    });
    console.log(`[BE-02 setup] ${MATCH_COUNT} matches sembrados con club="${BE02_CLUB}"`);

    // Obtener el backup con los datos frescos para parsear en los tests
    const backupRes = await request.get("/api/backup", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(backupRes.status()).toBe(200);
    const backup  = JSON.parse(await backupRes.text());
    backupMatches = (backup.database.matches as any[]).filter(
      (m: any) => m.club === BE02_CLUB
    );
    console.log(`[BE-02 setup] ${backupMatches.length} matches de prueba capturados en backup`);
  });

  test.afterAll(async () => {
    // Limpiar datos de prueba restantes (en caso de fallo del test)
    await prisma.matches.deleteMany({ where: { club: BE02_CLUB } });
    await prisma.$disconnect();
  });

  test("conteos pre y post restauración son idénticos; FKs íntegras", async () => {
    // 1. Parsear backup → aislar registros de prueba
    console.log("\n[BE-02] 1. Matches en backup con club BE02:", backupMatches.length);
    expect(backupMatches).toHaveLength(MATCH_COUNT);

    // 2. Truncar (eliminar) los registros de prueba de la BD
    await prisma.matches.deleteMany({ where: { club: BE02_CLUB } });
    const countAfterDelete = await prisma.matches.count({ where: { club: BE02_CLUB } });
    console.log("[BE-02] 2. Matches tras truncar:", countAfterDelete);
    expect(countAfterDelete).toBe(0);

    // 3. Insertar con createMany desde el backup
    await prisma.matches.createMany({
      data: backupMatches.map((m: any) => ({
        id:           m.id,
        organizer_id: m.organizer_id,
        club:         m.club,
        format:       m.format,
        status:       m.status,
        match_date:   new Date(m.match_date),
        match_time:   new Date(m.match_time),
      })),
      skipDuplicates: true,
    });

    // 4. Comparar conteos pre/post
    const countAfterRestore = await prisma.matches.count({ where: { club: BE02_CLUB } });
    console.log("[BE-02] 3. Matches tras restaurar:", countAfterRestore, "| esperado:", MATCH_COUNT);
    expect(countAfterRestore).toBe(MATCH_COUNT);

    // Verificar integridad FK: organizer_id debe existir en users
    const userIds = new Set(
      (await prisma.users.findMany({ select: { id: true } })).map((u) => u.id)
    );
    const restoredMatches = await prisma.matches.findMany({ where: { club: BE02_CLUB } });
    const allFKValid = restoredMatches.every((m) => userIds.has(m.organizer_id));
    console.log("[BE-02] 4. FK organizer_id íntegros:", allFKValid);
    expect(allFKValid).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BE-03 | Ciclo completo de cron en entorno local
//
// Pre-condición : función runBackupJob accesible; directorio temporal disponible
// Pasos         : 1.Disparar cron manualmente 2.Verificar archivo en /backups/
//                 3.Parsear y validar estructura 4.Comparar conteos con BD
// Resultado     : AUTOMATIC_CRON_BACKUP; datos completos y coherentes con BD
// ════════════════════════════════════════════════════════════════════════════
test.describe("BE-03 | Ciclo completo de cron en entorno local", () => {
  const TMP_DIR = path.join(os.tmpdir(), `e2e-cron-be03-${Date.now()}`);
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = makePrisma();
    fs.mkdirSync(TMP_DIR, { recursive: true });
    console.log("[BE-03 setup] Directorio temporal:", TMP_DIR);
  });

  test.afterAll(async () => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  test("runBackupJob escribe archivo con tipo AUTOMATIC_CRON_BACKUP coherente con BD", async () => {
    // Wrapper explícito para que getModelNames() detecte las 6 tablas esperadas
    // (Object.keys sobre un PrismaClient real puede devolver más modelos)
    const prismaProxy = {
      users:          prisma.users,
      matches:        prisma.matches,
      match_players:  prisma.match_players,
      match_results:  prisma.match_results,
      mmr_history:    prisma.mmr_history,
      refresh_tokens: prisma.refresh_tokens,
    };

    const triggerDate = new Date();

    // 1. Disparar el cron manualmente
    const filePath = await runBackupJob(prismaProxy as any, TMP_DIR, triggerDate);
    console.log("\n[BE-03] 1. runBackupJob completado:", path.basename(filePath));

    // 2. Verificar que el archivo existe y tiene tamaño > 0
    expect(fs.existsSync(filePath)).toBe(true);
    const stats = fs.statSync(filePath);
    console.log("[BE-03] 2. Tamaño del archivo:", stats.size, "bytes");
    expect(stats.size).toBeGreaterThan(0);
    expect(path.basename(filePath)).toMatch(
      /^cron_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/
    );

    // 3. Parsear y validar estructura
    const content = fs.readFileSync(filePath, "utf-8");
    const backup  = JSON.parse(content);

    console.log("[BE-03] 3. backup_info.type:", backup.backup_info?.type);
    expect(backup.backup_info.type).toBe("AUTOMATIC_CRON_BACKUP");
    expect(backup.backup_info.database_provider).toBe("PostgreSQL (Supabase)");
    expect(backup.backup_info.backup_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    for (const table of BACKUP_TABLES) {
      expect(backup.database).toHaveProperty(table);
      expect(Array.isArray(backup.database[table])).toBe(true);
    }

    // 4. Comparar conteos con la BD en tiempo real
    console.log("[BE-03] 4. Comparando conteos backup vs BD:");
    for (const table of BACKUP_TABLES) {
      const dbCount     = await (prisma[table] as any).count();
      const backupCount = (backup.database[table] as any[]).length;
      console.log(`[BE-03]    ${table}: BD=${dbCount}, backup=${backupCount}`);
      expect(backupCount).toBe(dbCount);
    }
  });
});
