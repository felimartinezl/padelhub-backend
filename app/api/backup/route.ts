import { NextResponse } from "next/server";
// Ajusta la importación según dónde tengas instanciado tu PrismaClient
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // 1. Obtener de forma dinámica los nombres de todos los modelos (tablas) registrados en Prisma
    // Esto evita tener que escribir prisma.user.findMany(), prisma.match.findMany(), etc. uno por uno.
    const modelNames = Object.keys(prisma).filter(
      (key) => !key.startsWith("_") && !key.startsWith("$")
    );

    const fullBackupData: Record<string, any> = {};
    let totalRecordsCount = 0;

    // 2. Recorrer cada tabla, extraer sus filas y meterlas al objeto de respaldo
    for (const model of modelNames) {
      try {
        // Ejecuta dinámicamente un .findMany() sobre la entidad actual
        const tableData = await (prisma as any)[model].findMany();
        
        fullBackupData[model] = {
          record_count: tableData.length,
          records: tableData
        };
        
        totalRecordsCount += tableData.length;
      } catch (tableError) {
        console.error(`Error respaldando la tabla ${model}:`, tableError);
        fullBackupData[model] = {
          error: "No se pudo extraer la información de esta tabla.",
          records: []
        };
      }
    }

    // 3. Estructurar el JSON maestro final
    const masterBackup = {
      backup_info: {
        project: "PadelHub Backend",
        environment: process.env.NODE_ENV || "production",
        backup_date: new Date().toISOString(),
        exported_entities_count: modelNames.length,
        total_records_exported: totalRecordsCount,
        database_provider: "PostgreSQL (Supabase)"
      },
      database: fullBackupData
    };

    // 4. Convertir a String JSON tabulado (legible y bonito)
    const jsonString = JSON.stringify(masterBackup, null, 2);
    
    // 5. Nombre dinámico con la fecha de hoy
    const today = new Date().toISOString().split('T')[0];
    const fileName = `padelhub_FULL_backup_${today}.json`;

    // 6. Enviar el archivo forzando la descarga en el cliente (Navegador o Postman)
    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error("Error crítico generando el backup completo:", error);
    return NextResponse.json(
      { error: "Error interno crítico al procesar el respaldo total de la base de datos." },
      { status: 500 }
    );
  } finally {
    // Desconectamos limpiamente para no dejar colgada la conexión del pooler
    await prisma.$disconnect();
  }
}
