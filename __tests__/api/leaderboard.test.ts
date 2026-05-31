import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/leaderboard/route";
import { MockPrisma } from "../../__mocks__/prisma";

const mockPrisma = prisma as unknown as MockPrisma;

const mockPlayer = {
  id: "uuid-1",
  name: "Juan Pérez",
  photo_url: null,
  level: "tercera" as const,
  zone: "Santiago",
  mmr: 1050,
  _count: { mmr_history: 5 },
};

describe("GET /api/leaderboard", () => {
  it("devuelve ranking nacional cuando no hay filtro de zona", async () => {
    mockPrisma.users.findMany.mockResolvedValue([mockPlayer] as any);

    const req = new Request("http://localhost/api/leaderboard");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope).toBe("national");
    expect(body.zone).toBeNull();
    expect(body.players).toHaveLength(1);
    expect(body.players[0].rank).toBe(1);
    expect(body.players[0].mmr).toBe(1050);
  });

  it("filtra por zona cuando se pasa ?zone=Santiago", async () => {
    mockPrisma.users.findMany.mockResolvedValue([mockPlayer] as any);

    const req = new Request("http://localhost/api/leaderboard?zone=Santiago");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope).toBe("zone");
    expect(body.zone).toBe("Santiago");

    // Verifica que Prisma recibió el filtro de zona
    expect(mockPrisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ zone: "Santiago" }),
      })
    );
  });

  it("respeta el límite por defecto de 50", async () => {
    mockPrisma.users.findMany.mockResolvedValue([]);

    const req = new Request("http://localhost/api/leaderboard");
    await GET(req);

    expect(mockPrisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it("devuelve 200 con lista vacía si no hay jugadores", async () => {
    mockPrisma.users.findMany.mockResolvedValue([]);

    const req = new Request("http://localhost/api/leaderboard");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.players).toEqual([]);
  });
});
