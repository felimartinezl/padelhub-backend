import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-middleware";
import {
  getModelNames,
  buildBackupMetadata,
  serializeBackup,
  generateBackupFilename,
} from "@/lib/backup";

export async function GET(request: Request) {
  const { payload, errorResponse } = requireAuth(request);
  if (errorResponse) return errorResponse;

  if (payload.role !== "admin") {
    return NextResponse.json(
      { error: "Acceso restringido a administradores" },
      { status: 403 }
    );
  }

  try {
    const modelNames = getModelNames(prisma as any);
    const database: Record<string, any[]> = {};

    for (const model of modelNames) {
      try {
        database[model] = await (prisma as any)[model].findMany();
      } catch {
        database[model] = [];
      }
    }

    const masterBackup = {
      backup_info: buildBackupMetadata("MANUAL_HTTP_BACKUP"),
      database,
    };

    const json     = serializeBackup(masterBackup);
    const filename = generateBackupFilename("backup");

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error crítico generando el backup:", error);
    return NextResponse.json(
      { error: "Error interno crítico al procesar el respaldo." },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
