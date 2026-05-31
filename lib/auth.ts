import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_TTL = "1h";

export interface JwtPayload {
  userId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function validateRefreshToken(token: string): Promise<string> {
  const record = await prisma.refresh_tokens.findUnique({
    where: { token },
    select: { user_id: true, expires_at: true },
  });

  if (!record) throw new Error("Refresh token no encontrado o revocado");
  if (record.expires_at < new Date()) throw new Error("Refresh token expirado");

  return record.user_id;
}
