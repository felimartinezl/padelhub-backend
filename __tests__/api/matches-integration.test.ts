import { generateToken } from "@/lib/auth";

// ── Mock de Prisma ────────────────────────────────────────────────────────────
jest.mock("@/lib/prisma", () => ({
  prisma: {
    matches:       { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    match_players: { create: jest.fn(), createMany: jest.fn() },
    match_results: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    mmr_history:   { create: jest.fn() },
    users:         { update: jest.fn() },
    $transaction:  jest.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { POST as createMatchHandler, GET as listMatchesHandler } from "@/app/api/matches/route";
import { GET as getMatchHandler, DELETE as deleteMatchHandler } from "@/app/api/matches/[id]/route";
import { POST as confirmResultHandler } from "@/app/api/matches/[id]/result/confirm/route";

// ── IDs de prueba ─────────────────────────────────────────────────────────────
const [P1, P2, P3, P4] = [
  "00000000-0000-0000-0000-000000000011",
  "00000000-0000-0000-0000-000000000012",
  "00000000-0000-0000-0000-000000000013",
  "00000000-0000-0000-0000-000000000014",
];
const P_OTHER  = "00000000-0000-0000-0000-000000000099";
const MATCH_ID = "bbbbbbbb-0000-0000-0000-000000000001";

// Tokens JWT válidos para cada actor
const tokenP1    = generateToken(P1, "player");
const tokenP3    = generateToken(P3, "player");
const tokenOther = generateToken(P_OTHER, "player");

// Match con 4 jugadores confirmados (P1+P2 = team_a, P3+P4 = team_b)
const MATCH_WITH_PLAYERS = {
  id:           MATCH_ID,
  organizer_id: P1,
  club:         "Club Test",
  format:       "doubles",
  status:       "open",
  match_date:   new Date("2025-06-01"),
  match_time:   new Date("2025-06-01T10:00:00"),
  users:        { id: P1, name: "Player 1", level: "tercera", zone: "Santiago" },
  match_players: [
    { user_id: P1, team: "team_a", status: "confirmed", joined_at: new Date(), users: { id: P1, name: "Player 1", level: "tercera", photo_url: null } },
    { user_id: P2, team: "team_a", status: "confirmed", joined_at: new Date(), users: { id: P2, name: "Player 2", level: "tercera", photo_url: null } },
    { user_id: P3, team: "team_b", status: "confirmed", joined_at: new Date(), users: { id: P3, name: "Player 3", level: "tercera", photo_url: null } },
    { user_id: P4, team: "team_b", status: "confirmed", joined_at: new Date(), users: { id: P4, name: "Player 4", level: "tercera", photo_url: null } },
  ],
  match_results: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation((ops: any) =>
    typeof ops === "function" ? ops(prisma) : Promise.all(ops)
  );
});

// ════════════════════════════════════════════════════════════════════════════
// MI-01  Creación de match via API
// ════════════════════════════════════════════════════════════════════════════
describe("MI-01 | Creación de match via API", () => {
  it("POST /api/matches → 201 con matchId; match_players.create llamado con organizer_id", async () => {
    const mockMatch = { id: MATCH_ID, organizer_id: P1, club: "Club Test", status: "open" };

    (prisma.matches.create     as jest.Mock).mockResolvedValue(mockMatch);
    (prisma.match_players.create as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost/api/matches", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${tokenP1}`,
      },
      body: JSON.stringify({
        organizer_id: P1,
        club:         "Club Test",
        match_date:   "2025-06-01",
        match_time:   "10:00",
      }),
    });

    const res  = await createMatchHandler(req);
    const body = await res.json();

    console.log("\n[MI-01] Status:", res.status);
    console.log("[MI-01] matchId:", body.match?.id);
    console.log("[MI-01] match_players.create llamado:", (prisma.match_players.create as jest.Mock).mock.calls.length > 0);

    expect(res.status).toBe(201);
    expect(body.match.id).toBe(MATCH_ID);
    expect(prisma.matches.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizer_id: P1, club: "Club Test" }) })
    );
    expect(prisma.match_players.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ user_id: P1, team: "team_a" }) })
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MI-02  Listado de matches del usuario
// ════════════════════════════════════════════════════════════════════════════
describe("MI-02 | Listado de matches del usuario", () => {
  it("GET /api/matches con token válido → 200 con array de partidos", async () => {
    const mockMatches = Array.from({ length: 3 }, (_, i) => ({
      id:           `match-00${i + 1}`,
      organizer_id: P1,
      club:         `Club ${i + 1}`,
      format:       "doubles",
      status:       "open",
      match_date:   new Date(),
      match_time:   new Date(),
      users:        { id: P1, name: "Player 1", level: "tercera", zone: "Santiago" },
      match_players: [],
    }));

    (prisma.matches.findMany as jest.Mock).mockResolvedValue(mockMatches);

    const req = new Request("http://localhost/api/matches", {
      method:  "GET",
      headers: { "Authorization": `Bearer ${tokenP1}` },
    });

    const res  = await listMatchesHandler(req);

    console.log("\n[MI-02] Status:", res.status);

    expect(res.status).toBe(200);
    const body = await res.json();
    console.log("[MI-02] Matches retornados:", body.length);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MI-03  Obtener match por ID — participante autorizado
// ════════════════════════════════════════════════════════════════════════════
describe("MI-03 | Obtener match por ID", () => {
  it("GET /api/matches/:id con token de participante → 200 con players y result anidados", async () => {
    (prisma.matches.findUnique as jest.Mock).mockResolvedValue(MATCH_WITH_PLAYERS);

    const req = new Request(`http://localhost/api/matches/${MATCH_ID}`, {
      method:  "GET",
      headers: { "Authorization": `Bearer ${tokenP1}` },
    });

    const res  = await getMatchHandler(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    console.log("\n[MI-03] Status:", res.status);
    console.log("[MI-03] match.id:", body.id);
    console.log("[MI-03] players.length:", body.players?.length);
    console.log("[MI-03] result presente:", "result" in body);

    expect(res.status).toBe(200);
    expect(body.id).toBe(MATCH_ID);
    expect(body.players).toHaveLength(4);
    expect(body).toHaveProperty("result");
    expect(body).toHaveProperty("organizer");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MI-04  Intento de acceso a match ajeno → 403
// ════════════════════════════════════════════════════════════════════════════
describe("MI-04 | Intento de acceso a match ajeno", () => {
  it("GET /api/matches/:id con token de no-participante → 403 'Acceso denegado'", async () => {
    (prisma.matches.findUnique as jest.Mock).mockResolvedValue(MATCH_WITH_PLAYERS);

    const req = new Request(`http://localhost/api/matches/${MATCH_ID}`, {
      method:  "GET",
      headers: { "Authorization": `Bearer ${tokenOther}` },
    });

    const res  = await getMatchHandler(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    console.log("\n[MI-04] Status:", res.status);
    console.log("[MI-04] Error:", body.error);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Acceso denegado");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MI-05  Confirmación de resultado actualiza MMR
// ════════════════════════════════════════════════════════════════════════════
describe("MI-05 | Confirmación de resultado actualiza MMR", () => {
  it("POST /api/matches/:id/result/confirm → 200; mmr_history y users actualizados", async () => {
    const mockMatchForConfirm = {
      ...MATCH_WITH_PLAYERS,
      status: "in_progress",
    };

    const mockResult = {
      id:            "result-001",
      match_id:      MATCH_ID,
      registered_by: P1,
      score_team_a:  "6-6",
      score_team_b:  "3-4",
      winner:        "team_a",
      confirmed:     false,
      confirmed_by:  null,
    };

    // Llamadas de la ruta confirm
    (prisma.matches.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockMatchForConfirm)    // confirm route
      .mockResolvedValueOnce({                        // calculateAndStoreMMR
        format:        "doubles",
        match_results: { winner: "team_a" },
        match_players: [P1, P2, P3, P4].map((uid, i) => ({
          user_id: uid,
          team:    i < 2 ? "team_a" : "team_b",
          users:   { mmr: 1000 },
        })),
      });

    (prisma.match_results.findUnique as jest.Mock).mockResolvedValue(mockResult);
    (prisma.match_results.update     as jest.Mock).mockResolvedValue({ ...mockResult, confirmed: true });
    (prisma.matches.update           as jest.Mock).mockResolvedValue({ ...mockMatchForConfirm, status: "finished" });
    (prisma.users.update             as jest.Mock).mockResolvedValue({});
    (prisma.mmr_history.create       as jest.Mock).mockResolvedValue({});

    // Mock de fetch hacia la MMR API externa
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({
        results: [
          { user_id: P1, mmr_before: 1000, mmr_after: 1025 },
          { user_id: P2, mmr_before: 1000, mmr_after: 1025 },
          { user_id: P3, mmr_before: 1000, mmr_after: 975  },
          { user_id: P4, mmr_before: 1000, mmr_after: 975  },
        ],
      }),
    } as Response);

    const req = new Request(`http://localhost/api/matches/${MATCH_ID}/result/confirm`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ confirmed_by: P3 }), // P3 es del equipo contrario a P1
    });

    const res  = await confirmResultHandler(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    console.log("\n[MI-05] Status:", res.status);
    console.log("[MI-05] mmr_updated:", body.mmr_updated);
    console.log("[MI-05] mmr_history.create llamadas:", (prisma.mmr_history.create as jest.Mock).mock.calls.length);
    console.log("[MI-05] users.update llamadas:", (prisma.users.update as jest.Mock).mock.calls.length);

    expect(res.status).toBe(200);
    expect(body.mmr_updated).toBe(true);
    // 4 jugadores → 4 filas en mmr_history y 4 updates en users
    expect(prisma.mmr_history.create).toHaveBeenCalledTimes(4);
    expect(prisma.users.update).toHaveBeenCalledTimes(4);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MI-06  Eliminación de match (soft delete → CANCELLED)
// ════════════════════════════════════════════════════════════════════════════
describe("MI-06 | Eliminación de match (soft delete)", () => {
  it("DELETE /api/matches/:id con token del creador → 200; status 'cancelled'", async () => {
    (prisma.matches.findUnique as jest.Mock).mockResolvedValue({
      organizer_id: P1,
      status:       "open",
    });
    (prisma.matches.update as jest.Mock).mockResolvedValue({
      id:     MATCH_ID,
      status: "cancelled",
    });

    const req = new Request(`http://localhost/api/matches/${MATCH_ID}`, {
      method:  "DELETE",
      headers: { "Authorization": `Bearer ${tokenP1}` },
    });

    const res  = await deleteMatchHandler(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    console.log("\n[MI-06] Status:", res.status);
    console.log("[MI-06] match.status:", body.match?.status);
    console.log("[MI-06] matches.update con 'cancelled':",
      (prisma.matches.update as jest.Mock).mock.calls[0]?.[0]?.data?.status === "cancelled"
    );

    expect(res.status).toBe(200);
    expect(body.match.status).toBe("cancelled");
    expect(prisma.matches.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "cancelled" }) })
    );
  });
});
