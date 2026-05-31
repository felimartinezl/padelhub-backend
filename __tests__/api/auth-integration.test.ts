import bcrypt from "bcryptjs";
import { generateToken } from "@/lib/auth";
import { POST as loginHandler }   from "@/app/api/auth/login/route";
import { POST as refreshHandler } from "@/app/api/auth/refresh/route";
import { GET  as matchesHandler } from "@/app/api/matches/route";

// ── Mock de Prisma ───────────────────────────────────────────────────────────
jest.mock("@/lib/prisma", () => ({
  prisma: {
    users:          { findFirst: jest.fn(), findUnique: jest.fn() },
    refresh_tokens: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    matches:        { findMany: jest.fn() },
    $transaction:   jest.fn(),
  },
}));

// ── Importar prisma YA mockeado ──────────────────────────────────────────────
import { prisma } from "@/lib/prisma";

// ── Usuario de prueba compartido ─────────────────────────────────────────────
const TEST_USER = {
  id:            "uuid-integration-001",
  rut:           12345678,
  dv_rut:        "5",
  name:          "Test Player",
  phone:         "+56912345678",
  password_hash: "",          // se rellena en beforeAll
  photo_url:     null,
  level:         "tercera",
  zone:          "Santiago",
  mmr:           1000,
  role:          "player",
  is_active:     true,
  created_at:    new Date(),
  updated_at:    new Date(),
};

beforeAll(async () => {
  TEST_USER.password_hash = await bcrypt.hash("password123", 10);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// AI-01  Login exitoso retorna par de tokens
// ════════════════════════════════════════════════════════════════════════════
describe("AI-01 | Login exitoso retorna par de tokens", () => {
  it("POST /api/auth/login → 200 con accessToken, refreshToken y los persiste en BD", async () => {
    (prisma.users.findFirst as jest.Mock).mockResolvedValue(TEST_USER);
    (prisma.refresh_tokens.create as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rut: 12345678, password: "password123" }),
    });

    const res  = await loginHandler(req);
    const body = await res.json();

    console.log("\n[AI-01] Status:", res.status);
    console.log("[AI-01] accessToken presente:", !!body.accessToken);
    console.log("[AI-01] refreshToken presente:", !!body.refreshToken);
    console.log("[AI-01] refresh_tokens.create llamado:", (prisma.refresh_tokens.create as jest.Mock).mock.calls.length > 0);

    expect(res.status).toBe(200);
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
    expect(body.user).not.toHaveProperty("password_hash");

    // Evidencia: refreshToken persistido en BD
    expect(prisma.refresh_tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ user_id: TEST_USER.id }),
      })
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AI-02  Login con credenciales incorrectas → 401
// ════════════════════════════════════════════════════════════════════════════
describe("AI-02 | Login con credenciales incorrectas", () => {
  it("POST /api/auth/login → 401 sin tokens cuando la contraseña es incorrecta", async () => {
    (prisma.users.findFirst as jest.Mock).mockResolvedValue(TEST_USER);

    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rut: 12345678, password: "wrongpassword" }),
    });

    const res  = await loginHandler(req);
    const body = await res.json();

    console.log("\n[AI-02] Status:", res.status);
    console.log("[AI-02] Mensaje de error:", body.error);
    console.log("[AI-02] accessToken en respuesta:", body.accessToken ?? "no presente");
    console.log("[AI-02] refresh_tokens.create llamado:", (prisma.refresh_tokens.create as jest.Mock).mock.calls.length > 0);

    expect(res.status).toBe(401);
    expect(body).not.toHaveProperty("accessToken");
    expect(body).not.toHaveProperty("refreshToken");
    expect(prisma.refresh_tokens.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AI-03  Refresco de access token — rotación del refreshToken en BD
// ════════════════════════════════════════════════════════════════════════════
describe("AI-03 | Refresco de access token con rotación", () => {
  it("POST /api/auth/refresh → 200 con nuevo accessToken y refreshToken rotado en BD", async () => {
    const oldRefreshToken = "old-refresh-token-uuid";

    (prisma.refresh_tokens.findUnique as jest.Mock).mockResolvedValue({
      user_id:    TEST_USER.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    (prisma.users.findUnique as jest.Mock).mockResolvedValue({ role: "player" });
    (prisma.$transaction as jest.Mock).mockImplementation((ops: any[]) => Promise.all(ops));
    (prisma.refresh_tokens.delete as jest.Mock).mockResolvedValue({});
    (prisma.refresh_tokens.create as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: oldRefreshToken }),
    });

    const res  = await refreshHandler(req);
    const body = await res.json();

    console.log("\n[AI-03] Status:", res.status);
    console.log("[AI-03] Nuevo accessToken presente:", !!body.accessToken);
    console.log("[AI-03] Nuevo refreshToken presente:", !!body.refreshToken);
    console.log("[AI-03] Token rotado (delete llamado):", (prisma.refresh_tokens.delete as jest.Mock).mock.calls.length > 0);
    console.log("[AI-03] Nuevo token guardado en BD (create llamado):", (prisma.refresh_tokens.create as jest.Mock).mock.calls.length > 0);

    expect(res.status).toBe(200);
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
    // El nuevo refreshToken debe ser distinto al anterior
    expect(body.refreshToken).not.toBe(oldRefreshToken);
    // Evidencia de rotación: el token viejo fue eliminado y uno nuevo creado
    expect(prisma.refresh_tokens.delete).toHaveBeenCalledWith({ where: { token: oldRefreshToken } });
    expect(prisma.refresh_tokens.create).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AI-04  Acceso a ruta protegida con token válido → 200
// ════════════════════════════════════════════════════════════════════════════
describe("AI-04 | Acceso a ruta protegida con token válido", () => {
  it("GET /api/matches con Authorization: Bearer <token> → 200 con datos", async () => {
    const validToken = generateToken(TEST_USER.id, TEST_USER.role);
    (prisma.matches.findMany as jest.Mock).mockResolvedValue([]);

    const req = new Request("http://localhost/api/matches", {
      method: "GET",
      headers: { Authorization: `Bearer ${validToken}` },
    });

    const res  = await matchesHandler(req);
    const body = await res.json();

    console.log("\n[AI-04] Status:", res.status);
    console.log("[AI-04] Token usado:", validToken.slice(0, 40) + "...");
    console.log("[AI-04] Respuesta:", Array.isArray(body) ? `Array de ${body.length} partidos` : body);

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AI-05  Acceso a ruta protegida sin token → 401
// ════════════════════════════════════════════════════════════════════════════
describe("AI-05 | Acceso a ruta protegida sin token", () => {
  it("GET /api/matches sin header Authorization → 401 con mensaje 'No autorizado'", async () => {
    const req = new Request("http://localhost/api/matches", {
      method: "GET",
      // Sin header Authorization
    });

    const res  = await matchesHandler(req);
    const body = await res.json();

    console.log("\n[AI-05] Status:", res.status);
    console.log("[AI-05] Mensaje:", body.error);
    console.log("[AI-05] matches.findMany llamado:", (prisma.matches.findMany as jest.Mock).mock.calls.length > 0);

    expect(res.status).toBe(401);
    expect(body.error).toBe("No autorizado");
    // Evidencia: la BD nunca fue consultada
    expect(prisma.matches.findMany).not.toHaveBeenCalled();
  });
});
