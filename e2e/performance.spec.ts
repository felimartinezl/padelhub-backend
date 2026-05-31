import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as fs   from "fs";
import * as os   from "os";
import * as path from "path";
import { runBackupJob } from "../lib/backup";
import { E2E_USER, E2E_PLAYERS, E2E_ADMIN } from "./global-setup";

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

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

// ════════════════════════════════════════════════════════════════════════════
// BP-01 | Tiempo de generación con BD grande
//
// Pre-condición : BD de test con >= 100.000 registros distribuidos en 6 tablas
// Pasos         : 1.Sembrar hasta alcanzar el target  2.GET /api/backup; medir tiempo
//                 3.Verificar sin timeout HTTP  4.Tres backups consecutivos sin degradación
// Resultado     : < 10 s; sin timeout HTTP; memoria estable (sin memory leak)
// ════════════════════════════════════════════════════════════════════════════
test.describe("BP-01 | Tiempo de generación con BD grande", () => {
  const PERF_CLUB   = "E2E_PERF_BP01";
  const TARGET_ROWS = 100_000;
  const BATCH_SIZE  = 1_000;

  let adminToken = "";
  let prisma: PrismaClient;

  // 5 min: cubre siembra de hasta 100k registros más 5 backups
  test.setTimeout(300_000);

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000); // la siembra puede superar el timeout global de 30s

    prisma = makePrisma();

    // 1. Autenticar admin
    const loginRes = await request.post("/api/auth/login", {
      data: { rut: E2E_ADMIN.rut, password: E2E_ADMIN.password },
    });
    expect(loginRes.status()).toBe(200);
    adminToken = (await loginRes.json()).accessToken;
    console.log("[BP-01 setup] Admin autenticado OK");

    // 2. Contar registros totales actuales en las 6 tablas
    const tableCounts  = await Promise.all(
      BACKUP_TABLES.map((t) => (prisma[t] as any).count())
    );
    const totalRecords = tableCounts.reduce((s, c) => s + c, 0);
    const toSeed       = Math.max(0, TARGET_ROWS - totalRecords);
    console.log(`[BP-01 setup] Total actual: ${totalRecords}, a sembrar en matches: ${toSeed}`);

    // 3. Sembrar matches con PERF_CLUB para aislamiento y limpieza selectiva
    const organizerIds = [E2E_USER.id, ...E2E_PLAYERS.map((p) => p.id)];

    for (let i = 0; i < toSeed; i += BATCH_SIZE) {
      const batchCount = Math.min(BATCH_SIZE, toSeed - i);
      await prisma.matches.createMany({
        data: Array.from({ length: batchCount }, (_, j) => ({
          organizer_id: organizerIds[(i + j) % organizerIds.length],
          club:         PERF_CLUB,
          format:       "doubles",
          status:       "open",
          match_date:   new Date("2025-01-01"),
          match_time:   new Date("2025-01-01T10:00:00"),
        })),
      });
    }

    const newTotal = (
      await Promise.all(BACKUP_TABLES.map((t) => (prisma[t] as any).count()))
    ).reduce((s, c) => s + c, 0);
    console.log(`[BP-01 setup] Total tras siembra: ${newTotal} registros`);
  });

  test.afterAll(async () => {
    await prisma.matches.deleteMany({ where: { club: PERF_CLUB } });
    await prisma.$disconnect();
  });

  test("responde en < 10 s con >= 100k registros totales en BD", async ({ request }) => {
    // Verificar pre-condición: total >= 100k
    const tableCounts = await Promise.all(
      BACKUP_TABLES.map((t) => (prisma[t] as any).count())
    );
    const total = tableCounts.reduce((s, c) => s + c, 0);
    console.log(`\n[BP-01] Total registros en BD: ${total}`);
    BACKUP_TABLES.forEach((t, i) => console.log(`[BP-01]   ${t}: ${tableCounts[i]}`));
    expect(total).toBeGreaterThanOrEqual(TARGET_ROWS);

    // Medir tiempo de respuesta
    const t0  = Date.now();
    const res = await request.get("/api/backup", {
      headers: { Authorization: `Bearer ${adminToken}` },
      timeout: 15_000,
    });
    const elapsed = Date.now() - t0;

    console.log(`[BP-01] Tiempo de respuesta: ${elapsed} ms`);
    expect(res.status()).toBe(200);
    expect(elapsed).toBeLessThan(10_000);
  });

  test("sin timeout HTTP: Content-Disposition presente y body no vacío", async ({ request }) => {
    const res = await request.get("/api/backup", {
      headers: { Authorization: `Bearer ${adminToken}` },
      timeout: 15_000,
    });

    const disposition = res.headers()["content-disposition"] ?? "";
    const body        = await res.text();

    console.log(`\n[BP-01] Status: ${res.status()}`);
    console.log(`[BP-01] Content-Disposition: ${disposition}`);
    console.log(`[BP-01] Tamaño del body: ${body.length} bytes`);

    expect(res.status()).toBe(200);
    expect(disposition).toContain("attachment");
    expect(body.length).toBeGreaterThan(0);
  });

  test("memoria estable: tres backups consecutivos sin degradación acumulada", async ({ request }) => {
    const times: number[] = [];

    for (let i = 0; i < 3; i++) {
      const t0  = Date.now();
      const res = await request.get("/api/backup", {
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 15_000,
      });
      times.push(Date.now() - t0);
      expect(res.status()).toBe(200);
      console.log(`\n[BP-01] Backup #${i + 1}: ${times[i]} ms`);
    }

    // Proxy de memory-leak: un proceso con fuga se degrada en ejecuciones sucesivas.
    // El backup #3 no debe ser > 50% más lento que el #1.
    const degradation = times[2] / times[0];
    console.log(`[BP-01] Factor de degradación (#3 / #1): ${degradation.toFixed(2)}x`);
    expect(degradation).toBeLessThan(1.5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BP-02 | Cron no bloquea otras solicitudes
//
// Pre-condición : servidor bajo carga moderada (~20 req/s simuladas con burst)
// Pasos         : 1.Medir baseline P95 de /api/health  2.Disparar cron + carga simultánea
//                 3.Medir P95 durante cron  4.Comparar degradación
// Resultado     : Latencia P95 de rutas normales no aumenta > 20% durante el cron
// ════════════════════════════════════════════════════════════════════════════
test.describe("BP-02 | Cron no bloquea otras solicitudes", () => {
  const CONCURRENCY = 20;     // burst de 20 req simultáneas ≈ 20 req/s
  const PROBE_ROUTE = "/api/health";
  const TMP_DIR     = path.join(os.tmpdir(), `e2e-perf-bp02-${Date.now()}`);

  let prisma: PrismaClient;

  test.setTimeout(60_000);

  test.beforeAll(async () => {
    prisma = makePrisma();
    fs.mkdirSync(TMP_DIR, { recursive: true });
    console.log("[BP-02 setup] Directorio temporal:", TMP_DIR);
  });

  test.afterAll(async () => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  test("P95 de rutas normales no aumenta > 20% durante ejecución del cron", async ({ request }) => {
    // Envía CONCURRENCY peticiones concurrentes y devuelve sus latencias individuales
    async function measureBatch(): Promise<number[]> {
      return Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          const t0 = Date.now();
          await request.get(PROBE_ROUTE, { timeout: 10_000 });
          return Date.now() - t0;
        })
      );
    }

    // 1. Baseline: P95 sin cron activo
    const baselineSamples = await measureBatch();
    const baselineP95     = p95(baselineSamples);
    console.log(`\n[BP-02] Baseline P95: ${baselineP95} ms (n=${CONCURRENCY})`);
    console.log(`[BP-02] Baseline samples: [${baselineSamples.sort((a, b) => a - b).join(", ")}]`);

    // 2. Medir P95 mientras el cron escribe el backup (se ejecutan en paralelo)
    const prismaProxy = {
      users:          prisma.users,
      matches:        prisma.matches,
      match_players:  prisma.match_players,
      match_results:  prisma.match_results,
      mmr_history:    prisma.mmr_history,
      refresh_tokens: prisma.refresh_tokens,
    };

    const [loadSamples] = await Promise.all([
      measureBatch(),
      runBackupJob(prismaProxy as any, TMP_DIR, new Date()),
    ]);
    const loadP95 = p95(loadSamples);
    console.log(`[BP-02] P95 durante cron: ${loadP95} ms`);
    console.log(`[BP-02] Load samples: [${loadSamples.sort((a, b) => a - b).join(", ")}]`);

    // 3. Verificar que la degradación no supera el 20%
    const increase = (loadP95 - baselineP95) / baselineP95;
    console.log(`[BP-02] Aumento relativo de P95: ${(increase * 100).toFixed(1)}%`);
    expect(increase).toBeLessThan(0.20);
  });
});
