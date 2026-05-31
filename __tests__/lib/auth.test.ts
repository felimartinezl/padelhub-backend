import jwt from "jsonwebtoken";
import { generateToken, verifyToken, hashPassword, validateRefreshToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MockPrisma } from "../../__mocks__/prisma";

const mockPrisma = prisma as unknown as MockPrisma;

const JWT_SECRET = "test-secret-jest";

// ─────────────────────────────────────────────
// AU-01  Generación de JWT válido
// ─────────────────────────────────────────────
describe("AU-01 | Generación de JWT válido", () => {
  it("generateToken devuelve un token con exp, iat, userId y role correctos", () => {
    const userId = "uuid-player-001";
    const role   = "player";

    const token = generateToken(userId, role);
    const decoded = jwt.decode(token) as Record<string, any>;

    console.log("\n[AU-01] Token generado:", token);
    console.log("[AU-01] Payload decodificado:", decoded);

    expect(typeof token).toBe("string");
    expect(decoded.userId).toBe(userId);
    expect(decoded.role).toBe(role);
    expect(typeof decoded.iat).toBe("number");
    expect(typeof decoded.exp).toBe("number");
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });
});

// ─────────────────────────────────────────────
// AU-02  Rechazo de token expirado
// ─────────────────────────────────────────────
describe("AU-02 | Rechazo de token expirado", () => {
  it("verifyToken lanza TokenExpiredError con un token vencido", () => {
    const expiredToken = jwt.sign(
      { userId: "uuid-expired", role: "player" },
      JWT_SECRET,
      { expiresIn: -1 } // expirado de inmediato
    );

    console.log("\n[AU-02] Token expirado:", expiredToken);

    expect(() => verifyToken(expiredToken)).toThrow(jwt.TokenExpiredError);

    try {
      verifyToken(expiredToken);
    } catch (err: any) {
      console.log("[AU-02] Error capturado:", err.name, "-", err.message);
      expect(err.name).toBe("TokenExpiredError");
    }
  });
});

// ─────────────────────────────────────────────
// AU-03  Rechazo de token con firma inválida
// ─────────────────────────────────────────────
describe("AU-03 | Rechazo de token con firma inválida", () => {
  it("verifyToken lanza JsonWebTokenError con un token manipulado", () => {
    const validToken  = generateToken("uuid-player-003", "player");
    const [header, payload] = validToken.split(".");
    const tamperedToken = `${header}.${payload}.firma_falsa_manipulada`;

    console.log("\n[AU-03] Token original:", validToken);
    console.log("[AU-03] Token manipulado:", tamperedToken);

    expect(() => verifyToken(tamperedToken)).toThrow(jwt.JsonWebTokenError);

    try {
      verifyToken(tamperedToken);
    } catch (err: any) {
      console.log("[AU-03] Error capturado:", err.name, "-", err.message);
      expect(err.name).toBe("JsonWebTokenError");
    }
  });
});

// ─────────────────────────────────────────────
// AU-04  Hash de contraseña seguro
// ─────────────────────────────────────────────
describe("AU-04 | Hash de contraseña seguro", () => {
  it("hashPassword devuelve un hash bcrypt de 60 chars que no contiene la contraseña original", async () => {
    const plainPassword = "miPass123";

    const hash = await hashPassword(plainPassword);

    console.log("\n[AU-04] Contraseña original:", plainPassword);
    console.log("[AU-04] Hash generado:", hash);
    console.log("[AU-04] Longitud del hash:", hash.length);

    expect(hash).not.toBe(plainPassword);
    expect(hash.length).toBe(60);
    expect(hash).not.toContain(plainPassword);
    expect(hash.startsWith("$2")).toBe(true); // prefijo bcrypt
  });
});

// ─────────────────────────────────────────────
// AU-05  Validación de refresh token en BD
// ─────────────────────────────────────────────
describe("AU-05 | Validación de refresh token vigente", () => {
  it("validateRefreshToken retorna el userId cuando el token existe y no está expirado", async () => {
    const fakeToken  = "refresh-token-valido-abc123";
    const fakeUserId = "uuid-player-005";

    mockPrisma.refresh_tokens.findUnique.mockResolvedValue({
      user_id:    fakeUserId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días en el futuro
    } as any);

    console.log("\n[AU-05] Token a validar:", fakeToken);

    const userId = await validateRefreshToken(fakeToken);

    console.log("[AU-05] userId retornado:", userId);

    expect(userId).toBe(fakeUserId);
    expect(mockPrisma.refresh_tokens.findUnique).toHaveBeenCalledWith({
      where:  { token: fakeToken },
      select: { user_id: true, expires_at: true },
    });
  });
});

// ─────────────────────────────────────────────
// AU-06  Rechazo de refresh token revocado
// ─────────────────────────────────────────────
describe("AU-06 | Rechazo de refresh token revocado", () => {
  it("validateRefreshToken lanza error cuando el token no existe en BD (revocado)", async () => {
    const revokedToken = "refresh-token-revocado-xyz";

    mockPrisma.refresh_tokens.findUnique.mockResolvedValue(null); // no existe en BD

    console.log("\n[AU-06] Token revocado a validar:", revokedToken);

    await expect(validateRefreshToken(revokedToken)).rejects.toThrow(
      "Refresh token no encontrado o revocado"
    );

    console.log("[AU-06] Error lanzado correctamente: token rechazado, no se emite nuevo access token");
  });

  it("validateRefreshToken lanza error cuando el token está expirado", async () => {
    const expiredRefreshToken = "refresh-token-expirado-xyz";

    mockPrisma.refresh_tokens.findUnique.mockResolvedValue({
      user_id:    "uuid-player-006",
      expires_at: new Date(Date.now() - 1000), // ya expiró
    } as any);

    console.log("\n[AU-06b] Token con expires_at en el pasado:", expiredRefreshToken);

    await expect(validateRefreshToken(expiredRefreshToken)).rejects.toThrow(
      "Refresh token expirado"
    );

    console.log("[AU-06b] Error lanzado correctamente: token expirado, no se emite nuevo access token");
  });
});
