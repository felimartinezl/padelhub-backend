import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_USER, E2E_PLAYERS } from "./global-setup";

// Club único para aislar datos de paginación (ME-03)
const ME03_CLUB = "E2E_ME03_CLUB_PAGINATION";

function makePrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });
}

async function cleanupMatch(prisma: PrismaClient, matchId: string) {
  await prisma.mmr_history.deleteMany({ where: { match_id: matchId } });
  await prisma.match_results.deleteMany({ where: { match_id: matchId } });
  await prisma.match_players.deleteMany({ where: { match_id: matchId } });
  await prisma.matches.deleteMany({ where: { id: matchId } });
}

// ════════════════════════════════════════════════════════════════════════════
// ME-01  Flujo completo creación-resultado-MMR
//
// Pre-condición: 4 usuarios registrados y autenticados (sembrados en setup)
// Pasos:
//   1. Crear match (match_time = ahora para ventana activa)
//   2. Unir 3 jugadores adicionales via POST /join
//   3. Iniciar partido (POST /start, solo puede el organizador)
//   4. Registrar resultado (team_a gana)
//   5. Confirmar resultado (jugador del equipo contrario)
// Resultado esperado: match status="finished"; MMR de ganadores sube,
//   perdedores baja; historial en mmr_history (si MMR_API_URL configurada)
// ════════════════════════════════════════════════════════════════════════════
test.describe("ME-01 | Flujo completo creación-resultado-MMR", () => {
  let matchId = "";
  let prisma!: PrismaClient;

  test.beforeAll(async () => {
    prisma = makePrisma();
  });

  test.afterAll(async () => {
    if (matchId) await cleanupMatch(prisma, matchId);
    await prisma.$disconnect();
  });

  test("Crear match → unir jugadores → iniciar → registrar → confirmar resultado → MMR", async ({ request }) => {
    // 1. Crear match con match_time en UTC = ahora (ventana ±15 min activa)
    const now        = new Date();
    const match_date = now.toISOString().slice(0, 10);
    const hh         = String(now.getUTCHours()).padStart(2, "0");
    const mm         = String(now.getUTCMinutes()).padStart(2, "0");
    const match_time = `${hh}:${mm}:00Z`;   // Z → interpreta como UTC en el servidor

    const createRes = await request.post("/api/matches", {
      data: { organizer_id: E2E_USER.id, club: "E2E_ME01_CLUB", match_date, match_time },
    });
    console.log("\n[ME-01] 1. Crear match:", createRes.status());
    expect(createRes.status()).toBe(201);

    const { match } = await createRes.json();
    matchId = match.id;
    console.log("[ME-01]    matchId:", matchId);

    // 2. Unir 3 jugadores
    // Equipos resultantes (lógica de join alterna team):
    //   team_a: E2E_USER, E2E_PLAYERS[1]
    //   team_b: E2E_PLAYERS[0], E2E_PLAYERS[2]
    for (const player of E2E_PLAYERS) {
      const joinRes = await request.post(`/api/matches/${matchId}/join`, {
        data: { user_id: player.id },
      });
      console.log(`[ME-01] 2. Join ${player.name}: ${joinRes.status()}`);
      expect(joinRes.status()).toBe(201);
    }

    // 3. Iniciar partido (organizador = E2E_USER)
    const startRes  = await request.post(`/api/matches/${matchId}/start`, {
      data: { user_id: E2E_USER.id },
    });
    const startBody = await startRes.json();
    console.log("[ME-01] 3. Iniciar partido:", startRes.status(), startBody.match?.status ?? startBody.error);
    expect(startRes.status()).toBe(200);

    // 4. Registrar resultado (E2E_USER desde team_a)
    const resultRes = await request.post(`/api/matches/${matchId}/result`, {
      data: {
        submitted_by: E2E_USER.id,
        score_team_a: "6-6",
        score_team_b: "3-4",
        winner:       "team_a",
      },
    });
    console.log("[ME-01] 4. Registrar resultado:", resultRes.status());
    expect(resultRes.status()).toBe(201);

    // 5. Confirmar resultado — E2E_PLAYERS[0] es de team_b (equipo contrario)
    const confirmRes  = await request.post(`/api/matches/${matchId}/result/confirm`, {
      data: { confirmed_by: E2E_PLAYERS[0].id },
    });
    const confirmBody = await confirmRes.json();
    console.log("[ME-01] 5. Confirmar resultado:", confirmRes.status());
    console.log("[ME-01]    winner:", confirmBody.winner);
    console.log("[ME-01]    mmr_updated:", confirmBody.mmr_updated);
    expect(confirmRes.status()).toBe(200);
    expect(confirmBody.winner).toBe("team_a");

    // 6. Verificar status en BD
    const matchRow = await prisma.matches.findUnique({ where: { id: matchId } });
    console.log("[ME-01] 6. Match status en BD:", matchRow?.status);
    expect(matchRow?.status).toBe("finished");

    // 7. Verificar MMR (condicional: solo si MMR_API_URL está configurada)
    if (confirmBody.mmr_updated) {
      const history = await prisma.mmr_history.findMany({ where: { match_id: matchId } });
      console.log("[ME-01] 7. mmr_history rows:", history.length);
      expect(history).toHaveLength(4);

      const winnerIds = [E2E_USER.id, E2E_PLAYERS[1].id];  // team_a
      const loserIds  = [E2E_PLAYERS[0].id, E2E_PLAYERS[2].id]; // team_b

      for (const h of history) {
        if (winnerIds.includes(h.user_id)) {
          console.log(`[ME-01]    Ganador ${h.user_id}: ${h.mmr_before} → ${h.mmr_after}`);
          expect(h.mmr_after).toBeGreaterThan(h.mmr_before);
        } else if (loserIds.includes(h.user_id)) {
          console.log(`[ME-01]    Perdedor ${h.user_id}: ${h.mmr_before} → ${h.mmr_after}`);
          expect(h.mmr_after).toBeLessThan(h.mmr_before);
        }
      }
    } else {
      console.warn("[ME-01] 7. MMR_API_URL no configurada o falló — verificación de historial omitida");
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ME-02  Concurrencia en registro de resultado
//
// Pre-condición: match en estado in_progress con 4 jugadores confirmados
// Pasos: enviar POST /result dos veces en paralelo con el mismo payload
// Resultado esperado: uno retorna 201, el otro 409 Conflict
// ════════════════════════════════════════════════════════════════════════════
test.describe("ME-02 | Concurrencia en registro de resultado", () => {
  let matchId = "";
  let prisma!: PrismaClient;

  test.beforeAll(async () => {
    prisma = makePrisma();

    // Crear match directamente en BD para velocidad y control total
    const match = await prisma.matches.create({
      data: {
        organizer_id: E2E_USER.id,
        club:         "E2E_ME02_CLUB",
        format:       "doubles",
        status:       "in_progress",
        match_date:   new Date(),
        match_time:   new Date(),
      },
    });
    matchId = match.id;

    await prisma.match_players.createMany({
      data: [
        { match_id: matchId, user_id: E2E_USER.id,        team: "team_a", status: "confirmed" },
        { match_id: matchId, user_id: E2E_PLAYERS[1].id,  team: "team_a", status: "confirmed" },
        { match_id: matchId, user_id: E2E_PLAYERS[0].id,  team: "team_b", status: "confirmed" },
        { match_id: matchId, user_id: E2E_PLAYERS[2].id,  team: "team_b", status: "confirmed" },
      ],
    });
    console.log("[ME-02 setup] Match listo en BD:", matchId);
  });

  test.afterAll(async () => {
    if (matchId) await cleanupMatch(prisma, matchId);
    await prisma.$disconnect();
  });

  test("Dos envíos de resultado en paralelo → uno 201, otro 409 Conflict", async ({ request }) => {
    const payload = {
      submitted_by: E2E_USER.id,
      score_team_a: "6-3",
      score_team_b: "3-6",
      winner:       "team_a",
    };

    console.log("\n[ME-02] Enviando 2 solicitudes de resultado en paralelo...");

    const [res1, res2] = await Promise.all([
      request.post(`/api/matches/${matchId}/result`, { data: payload }),
      request.post(`/api/matches/${matchId}/result`, { data: payload }),
    ]);

    const s1 = res1.status();
    const s2 = res2.status();
    console.log("[ME-02] Statuses recibidos:", s1, s2);

    expect([s1, s2]).toContain(201);
    expect([s1, s2]).toContain(409);

    // Solo debe existir un resultado en la BD
    const count = await prisma.match_results.count({ where: { match_id: matchId } });
    console.log("[ME-02] match_results en BD:", count);
    expect(count).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ME-03  Historial de partidos paginado
//
// Pre-condición: usuario con 52 matches en BD (club único para aislar datos)
// Pasos: GET /api/matches?page=N&limit=10&club=E2E_ME03_CLUB_PAGINATION
// Resultado esperado:
//   - Páginas 1-5 retornan exactamente 10 registros
//   - Página 6 (última) retorna los 2 restantes
//   - Metadata: total=52, pages=6
// ════════════════════════════════════════════════════════════════════════════
test.describe("ME-03 | Historial de partidos paginado", () => {
  const TOTAL  = 52;
  const LIMIT  = 10;
  const PAGES  = Math.ceil(TOTAL / LIMIT);   // 6
  const LAST_N = TOTAL % LIMIT || LIMIT;     // 2

  let accessToken = "";
  let prisma!: PrismaClient;

  test.beforeAll(async ({ request }) => {
    prisma = makePrisma();

    // Autenticarse para las peticiones GET (requieren auth)
    const loginRes = await request.post("/api/auth/login", {
      data: { rut: E2E_USER.rut, password: E2E_USER.password },
    });
    expect(loginRes.status()).toBe(200);
    accessToken = (await loginRes.json()).accessToken;

    // Limpiar datos residuales de ejecuciones anteriores y sembrar de nuevo
    await prisma.matches.deleteMany({ where: { club: ME03_CLUB } });
    await prisma.matches.createMany({
      data: Array.from({ length: TOTAL }, () => ({
        organizer_id: E2E_USER.id,
        club:         ME03_CLUB,
        format:       "doubles",
        status:       "open",
        match_date:   new Date(),
        match_time:   new Date(),
      })),
    });
    console.log(`[ME-03 setup] ${TOTAL} partidos sembrados con club "${ME03_CLUB}"`);
  });

  test.afterAll(async () => {
    await prisma.matches.deleteMany({ where: { club: ME03_CLUB } });
    await prisma.$disconnect();
  });

  test("page=1&limit=10 retorna 10 registros y metadata correcta", async ({ request }) => {
    const res  = await request.get(`/api/matches?page=1&limit=${LIMIT}&club=${ME03_CLUB}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();

    console.log("\n[ME-03] p1 status:", res.status());
    console.log("[ME-03] p1 data.length:", body.data?.length);
    console.log("[ME-03] p1 total:", body.total, "| pages:", body.pages);

    expect(res.status()).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(LIMIT);
    expect(body.total).toBe(TOTAL);
    expect(body.pages).toBe(PAGES);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(LIMIT);
  });

  test("Páginas intermedias (2–5) retornan exactamente 10 registros cada una", async ({ request }) => {
    for (const pg of [2, 3, 4, 5]) {
      const res  = await request.get(`/api/matches?page=${pg}&limit=${LIMIT}&club=${ME03_CLUB}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json();
      console.log(`[ME-03] p${pg} data.length:`, body.data?.length);
      expect(body.data).toHaveLength(LIMIT);
    }
  });

  test("Última página retorna los registros restantes", async ({ request }) => {
    const res  = await request.get(`/api/matches?page=${PAGES}&limit=${LIMIT}&club=${ME03_CLUB}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();

    console.log(`\n[ME-03] p${PAGES} (última) data.length:`, body.data?.length, "| esperado:", LAST_N);

    expect(res.status()).toBe(200);
    expect(body.data).toHaveLength(LAST_N);
    expect(body.page).toBe(PAGES);
  });
});
