import { NextResponse } from "next/server";
import { verifyToken, type JwtPayload } from "./auth";

export function getAuthPayload(request: Request): JwtPayload | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(auth.slice(7));
  } catch {
    return null;
  }
}

export function requireAuth(
  request: Request
): { payload: JwtPayload; errorResponse: null } | { payload: null; errorResponse: NextResponse } {
  const payload = getAuthPayload(request);
  if (!payload) {
    return {
      payload: null,
      errorResponse: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  return { payload, errorResponse: null };
}
