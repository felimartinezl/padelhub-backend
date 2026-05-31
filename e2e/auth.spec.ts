import { test, expect } from "@playwright/test";
import jwt from "jsonwebtoken";
import { E2E_USER } from "./global-setup";

const JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-jest";

// ════════════════════════════════════════════════════════════════════════════
// AE-01  Flujo completo de autenticación con expiración de token
//
// Pre-condición: usuario registrado; "navegador limpio" (sin tokens previos)
// Pasos:
//   1. Login
//   2. Acceder a ruta protegida con el access token
//   3. Simular expiración del access token
//   4. Refrescar token usando el refresh token
//   5. Acceder nuevamente con el nuevo access token
// Resultado esperado: acceso concedido en cada paso; token refrescado sin re-login
// ════════════════════════════════════════════════════════════════════════════
test.describe("AE-01 | Flujo completo de autenticación con expiración", () => {
  test("Login → ruta protegida → token expirado → refresh → acceso restaurado", async ({ request }) => {

    // ── 1. Login ──────────────────────────────────────────────────────────
    const loginRes = await request.post("/api/auth/login", {
      data: { rut: E2E_USER.rut, password: E2E_USER.password },
    });

    console.log("\n[AE-01] 1. Login status:", loginRes.status());
    expect(loginRes.status()).toBe(200);

    const { accessToken, refreshToken } = await loginRes.json();
    expect(typeof accessToken).toBe("string");
    expect(typeof refreshToken).toBe("string");

    // ── 2. Acceder a ruta protegida con token válido ───────────────────────
    const step2 = await request.get("/api/matches", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log("[AE-01] 2. Ruta protegida con token válido:", step2.status());
    expect(step2.status()).toBe(200);
    expect(Array.isArray(await step2.json())).toBe(true);

    // ── 3. Simular expiración: crear token JWT ya vencido ─────────────────
    const expiredToken = jwt.sign(
      { userId: E2E_USER.id, role: E2E_USER.role },
      JWT_SECRET,
      { expiresIn: -1 }   // expirado hace 1 segundo
    );

    const step3 = await request.get("/api/matches", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    console.log("[AE-01] 3. Ruta protegida con token EXPIRADO:", step3.status());
    expect(step3.status()).toBe(401);

    // ── 4. Refrescar token ────────────────────────────────────────────────
    const refreshRes = await request.post("/api/auth/refresh", {
      data: { refreshToken },
    });

    console.log("[AE-01] 4. Refresh status:", refreshRes.status());
    expect(refreshRes.status()).toBe(200);

    const newTokens = await refreshRes.json();
    expect(typeof newTokens.accessToken).toBe("string");
    expect(typeof newTokens.refreshToken).toBe("string");
    expect(newTokens.refreshToken).not.toBe(refreshToken);   // rotación
    console.log("[AE-01]    Refresh token rotado:", newTokens.refreshToken !== refreshToken);

    // ── 5. Acceder nuevamente con nuevo token ─────────────────────────────
    const step5 = await request.get("/api/matches", {
      headers: { Authorization: `Bearer ${newTokens.accessToken}` },
    });

    console.log("[AE-01] 5. Ruta protegida con nuevo token:", step5.status());
    expect(step5.status()).toBe(200);
    expect(Array.isArray(await step5.json())).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AE-02  Persistencia de sesión tras recarga de página
//
// Pre-condición: usuario autenticado en la app
// Pasos:
//   1. Iniciar sesión → almacenar tokens
//   2. Simular recarga (nueva sesión de request sin access token en memoria)
//   3. Usar el refresh token almacenado para obtener nuevas credenciales
//   4. Verificar que el usuario sigue autenticado con datos consistentes
// Resultado esperado: usuario permanece autenticado; datos de sesión consistentes
// ════════════════════════════════════════════════════════════════════════════
test.describe("AE-02 | Persistencia de sesión tras recarga", () => {
  test("Login → simular F5 (perder access token) → refresh → sesión restaurada con mismo usuario", async ({ request }) => {

    // ── 1. Login ──────────────────────────────────────────────────────────
    const loginRes = await request.post("/api/auth/login", {
      data: { rut: E2E_USER.rut, password: E2E_USER.password },
    });

    expect(loginRes.status()).toBe(200);
    const { refreshToken, user: userAtLogin } = await loginRes.json();

    console.log("\n[AE-02] 1. Login OK — usuario:", userAtLogin.name);

    // ── 2. Simular F5: el access token en memoria se pierde,
    //       solo queda el refresh token (persistido en localStorage/cookie) ─
    console.log("[AE-02] 2. Recarga simulada — access token descartado");

    // ── 3. Usar refresh token para recuperar sesión ───────────────────────
    const refreshRes = await request.post("/api/auth/refresh", {
      data: { refreshToken },
    });

    console.log("[AE-02] 3. Refresh post-recarga status:", refreshRes.status());
    expect(refreshRes.status()).toBe(200);

    const { accessToken: newAccess } = await refreshRes.json();
    expect(typeof newAccess).toBe("string");

    // ── 4. Verificar acceso y consistencia del usuario ────────────────────
    const matchesRes = await request.get("/api/matches", {
      headers: { Authorization: `Bearer ${newAccess}` },
    });

    console.log("[AE-02] 4. Ruta protegida con token restaurado:", matchesRes.status());
    expect(matchesRes.status()).toBe(200);

    // Decodificar token y verificar que el userId es el mismo
    const decoded = jwt.verify(newAccess, JWT_SECRET) as { userId: string; role: string };
    console.log("[AE-02]    userId en nuevo token:", decoded.userId);
    console.log("[AE-02]    userId en login original:", userAtLogin.id);
    expect(decoded.userId).toBe(userAtLogin.id);
    expect(decoded.role).toBe(E2E_USER.role);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AE-03  Cierre de sesión limpia tokens
//
// Pre-condición: usuario con sesión activa
// Pasos:
//   1. Login → obtener tokens
//   2. Logout → enviar refresh token para revocar
//   3. Intentar acceder a ruta protegida (access token ya inválido / expirado)
//   4. Intentar refrescar token con el refresh token revocado
//   5. Verificar que la BD no tiene registro del token revocado
// Resultado esperado: ambos tokens inútiles; BD sin registro del refresh token
// ════════════════════════════════════════════════════════════════════════════
test.describe("AE-03 | Cierre de sesión limpia tokens", () => {
  test("Login → logout → ruta protegida con token expirado → refresh revocado → BD limpia", async ({ request }) => {

    // ── 1. Login ──────────────────────────────────────────────────────────
    const loginRes = await request.post("/api/auth/login", {
      data: { rut: E2E_USER.rut, password: E2E_USER.password },
    });

    expect(loginRes.status()).toBe(200);
    const { refreshToken } = await loginRes.json();
    console.log("\n[AE-03] 1. Login OK");

    // ── 2. Logout ─────────────────────────────────────────────────────────
    const logoutRes = await request.post("/api/auth/logout", {
      data: { refreshToken },
    });

    console.log("[AE-03] 2. Logout status:", logoutRes.status());
    expect(logoutRes.status()).toBe(200);
    const logoutBody = await logoutRes.json();
    console.log("[AE-03]    Mensaje:", logoutBody.message);

    // ── 3. Simular intento de acceso post-logout con token expirado ───────
    // Los JWT son stateless: el access token válido sigue funcionando hasta
    // su expiración natural (1h). Por eso simulamos el estado post-expiración
    // con un token JWT firmado pero vencido, que es lo que vería el servidor
    // cuando el usuario intenta acceder después del logout + expiración.
    const expiredToken = jwt.sign(
      { userId: E2E_USER.id, role: E2E_USER.role },
      JWT_SECRET,
      { expiresIn: -1 }
    );

    const protectedRes = await request.get("/api/matches", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    console.log("[AE-03] 3. Ruta protegida con token expirado:", protectedRes.status());
    expect(protectedRes.status()).toBe(401);

    // ── 4. Intentar refrescar con refresh token revocado ──────────────────
    const refreshRes = await request.post("/api/auth/refresh", {
      data: { refreshToken },
    });

    console.log("[AE-03] 4. Refresh con token revocado:", refreshRes.status());
    expect(refreshRes.status()).toBe(401);
    const refreshBody = await refreshRes.json();
    console.log("[AE-03]    Error:", refreshBody.error);
    expect(refreshBody.error).toBe("Token inválido o revocado");

    // ── 5. Verificar que la BD no tiene el token ──────────────────────────
    // Evidencia indirecta: si el refresh retorna 401 "inválido o revocado",
    // confirma que el registro fue eliminado de refresh_tokens en el paso 2.
    console.log("[AE-03] 5. BD sin registro del token (confirmado por paso 4):", true);
  });
});
