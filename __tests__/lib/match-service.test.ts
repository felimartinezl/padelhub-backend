import { ValidationError, ConflictError } from "@/lib/errors";
import { createMatch, updateMatchStatus, registerResult } from "@/lib/match-service";

// ── Mock de Prisma ────────────────────────────────────────────────────────────
jest.mock("@/lib/prisma", () => ({
  prisma: {
    matches:       { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    match_players: { createMany: jest.fn() },
    match_results: { create: jest.fn() },
    $transaction:  jest.fn(),
  },
}));

import { prisma } from "@/lib/prisma";

// $transaction con callback: ejecuta fn pasándole el propio prisma mock como tx
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation((fn: any) =>
    typeof fn === "function" ? fn(prisma) : Promise.all(fn)
  );
});

// ── IDs de prueba ─────────────────────────────────────────────────────────────
const [P1, P2, P3, P4] = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
  "00000000-0000-0000-0000-000000000004",
];
const MATCH_ID = "aaaaaaaa-0000-0000-0000-000000000001";

// ════════════════════════════════════════════════════════════════════════════
// MU-01  Creación de match con datos válidos
// ════════════════════════════════════════════════════════════════════════════
describe("MU-01 | Creación de match con datos válidos", () => {
  it("createMatch con 4 playerIds retorna match con status 'open' y 4 match_players", async () => {
    const mockMatch = { id: MATCH_ID, status: "open", club: "Club Test" };
    const mockPlayers = [P1, P2, P3, P4].map((user_id, i) => ({
      id: `player-${i}`, match_id: MATCH_ID, user_id,
      team: i < 2 ? "team_a" : "team_b", status: "confirmed",
    }));

    (prisma.matches.create     as jest.Mock).mockResolvedValue(mockMatch);
    (prisma.match_players.createMany as jest.Mock).mockResolvedValue({ count: 4 });
    (prisma.matches.findUnique as jest.Mock).mockResolvedValue({
      ...mockMatch,
      match_players: mockPlayers,
    });

    const result = await createMatch({
      date:      "2025-06-01",
      court:     "Club Test",
      playerIds: [P1, P2, P3, P4],
    });

    console.log("\n[MU-01] match.id:", result?.id);
    console.log("[MU-01] match.status:", result?.status);
    console.log("[MU-01] match_players.length:", result?.match_players.length);

    expect(result?.id).toBe(MATCH_ID);
    expect(result?.status).toBe("open");
    expect(result?.match_players).toHaveLength(4);

    expect(prisma.matches.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ club: "Club Test" }) })
    );
    expect(prisma.match_players.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([
        expect.objectContaining({ user_id: P1, team: "team_a" }),
        expect.objectContaining({ user_id: P3, team: "team_b" }),
      ])})
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MU-02  Rechazo de match con menos de 4 jugadores
// ════════════════════════════════════════════════════════════════════════════
describe("MU-02 | Rechazo de match con menos de 4 jugadores", () => {
  it("createMatch con 2 playerIds lanza ValidationError", async () => {
    console.log("\n[MU-02] Llamando createMatch con 2 jugadores...");

    await expect(
      createMatch({ date: "2025-06-01", court: "Club Test", playerIds: [P1, P2] })
    ).rejects.toThrow(ValidationError);

    await expect(
      createMatch({ date: "2025-06-01", court: "Club Test", playerIds: [P1, P2] })
    ).rejects.toThrow("Se requieren exactamente 4 jugadores");

    console.log('[MU-02] ValidationError lanzado: "Se requieren exactamente 4 jugadores"');
    expect(prisma.matches.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MU-03  Rechazo de jugador duplicado
// ════════════════════════════════════════════════════════════════════════════
describe("MU-03 | Rechazo de jugador duplicado", () => {
  it("createMatch con playerIds repetidos lanza ValidationError", async () => {
    console.log("\n[MU-03] Llamando createMatch con P1 duplicado...");

    await expect(
      createMatch({ date: "2025-06-01", court: "Club Test", playerIds: [P1, P1, P2, P3] })
    ).rejects.toThrow(ValidationError);

    await expect(
      createMatch({ date: "2025-06-01", court: "Club Test", playerIds: [P1, P1, P2, P3] })
    ).rejects.toThrow("Jugadores duplicados no permitidos");

    console.log('[MU-03] ValidationError lanzado: "Jugadores duplicados no permitidos"');
    expect(prisma.matches.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MU-04  Actualización de estado del partido
// ════════════════════════════════════════════════════════════════════════════
describe("MU-04 | Actualización de estado del partido", () => {
  it("updateMatchStatus cambia status a 'in_progress' y actualiza updated_at", async () => {
    const before = new Date("2025-01-01T10:00:00Z");
    const mockUpdated = { id: MATCH_ID, status: "in_progress", updated_at: new Date() };

    (prisma.matches.update as jest.Mock).mockResolvedValue(mockUpdated);

    const result = await updateMatchStatus(MATCH_ID, "in_progress");

    console.log("\n[MU-04] status actualizado a:", result.status);
    console.log("[MU-04] updated_at modificado:", result.updated_at > before);

    expect(result.status).toBe("in_progress");
    expect(result.updated_at > before).toBe(true);
    expect(prisma.matches.update).toHaveBeenCalledWith({
      where: { id: MATCH_ID },
      data:  expect.objectContaining({ status: "in_progress" }),
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MU-05  Registro de resultado válido
// ════════════════════════════════════════════════════════════════════════════
describe("MU-05 | Registro de resultado válido", () => {
  it("registerResult en match 'in_progress' crea match_results y cambia status a 'finished'", async () => {
    const mockMatch = {
      id: MATCH_ID, status: "in_progress",
      match_players: [
        { user_id: P1, team: "team_a" },
        { user_id: P2, team: "team_a" },
        { user_id: P3, team: "team_b" },
        { user_id: P4, team: "team_b" },
      ],
    };
    const mockResult = {
      id: "result-001", match_id: MATCH_ID,
      score_team_a: "6-6", score_team_b: "3-4", winner: "team_a",
    };

    (prisma.matches.findUnique   as jest.Mock).mockResolvedValue(mockMatch);
    (prisma.match_results.create as jest.Mock).mockResolvedValue(mockResult);
    (prisma.matches.update       as jest.Mock).mockResolvedValue({ ...mockMatch, status: "finished" });

    const result = await registerResult(MATCH_ID, {
      sets:     [{ teamA: 6, teamB: 3 }, { teamA: 6, teamB: 4 }],
      winnerId: P1,
    });

    console.log("\n[MU-05] match_results.id:", result.id);
    console.log("[MU-05] score_team_a:", result.score_team_a);
    console.log("[MU-05] winner:", result.winner);
    console.log("[MU-05] matches.update llamado con status 'finished':",
      (prisma.matches.update as jest.Mock).mock.calls[0][0].data.status === "finished"
    );

    expect(result.id).toBeDefined();
    expect(result.winner).toBe("team_a");
    expect(prisma.match_results.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          match_id:     MATCH_ID,
          score_team_a: "6-6",
          score_team_b: "3-4",
          winner:       "team_a",
        }),
      })
    );
    expect(prisma.matches.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "finished" }) })
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MU-06  Rechazo de resultado en match ya completado
// ════════════════════════════════════════════════════════════════════════════
describe("MU-06 | Rechazo de resultado en match no activo", () => {
  it("registerResult en match 'finished' lanza ConflictError", async () => {
    (prisma.matches.findUnique as jest.Mock).mockResolvedValue({
      id: MATCH_ID, status: "finished", match_players: [],
    });

    console.log("\n[MU-06] Llamando registerResult en match con status 'finished'...");

    await expect(
      registerResult(MATCH_ID, {
        sets:     [{ teamA: 6, teamB: 3 }],
        winnerId: P1,
      })
    ).rejects.toThrow(ConflictError);

    await expect(
      registerResult(MATCH_ID, {
        sets:     [{ teamA: 6, teamB: 3 }],
        winnerId: P1,
      })
    ).rejects.toThrow("El partido ya tiene resultado registrado");

    console.log('[MU-06] ConflictError lanzado: "El partido ya tiene resultado registrado"');
    expect(prisma.match_results.create).not.toHaveBeenCalled();
  });
});
