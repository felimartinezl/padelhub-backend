export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    console.log("[CRON] Cron deshabilitado en entorno no-Node.js");
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = (await import('node-cron')).default;
    const fs = await import('fs');
    const path = await import('path');
    const { PrismaClient } = await import('@prisma/client');
    const { isMatchExpired } = await import('@/lib/match-window');

    const prisma = new PrismaClient();

    // Elimina partidos expirados (pasaron más de 15 min desde su hora)
    cron.schedule('*/1 * * * *', async () => {
      try {
        const pendingMatches = await prisma.matches.findMany({
          where: { status: { in: ['open', 'confirmed'] } },
          select: { id: true, match_date: true, match_time: true },
        });

        const expiredIds = pendingMatches
          .filter((m) => isMatchExpired(m.match_date, m.match_time))
          .map((m) => m.id);

        if (expiredIds.length > 0) {
          await prisma.matches.deleteMany({ where: { id: { in: expiredIds } } });
          console.log(`🗑️  [CRON] ${expiredIds.length} partido(s) expirado(s) eliminado(s).`);
        }
      } catch (error) {
        console.error('❌ [CRON] Error al limpiar partidos expirados:', error);
      }
    }, { scheduled: true, timezone: 'America/Santiago' } as any);

    console.log("⏰ [MOTOR] Sistema de Backups Automáticos inicializado correctamente.");

    // Backup diario a las 2:00 AM (America/Santiago)
    cron.schedule('0 2 * * *', async () => {
      console.log("💾 [CRON] Iniciando respaldo automático de la base de datos...");

      try {
        const modelNames = Object.keys(prisma).filter(
          (key) => !key.startsWith("_") && !key.startsWith("$")
        );

        const fullBackupData: Record<string, any> = {};
        for (const model of modelNames) {
          fullBackupData[model] = await (prisma as any)[model].findMany();
        }

        const masterBackup = {
          backup_info: {
            type: "AUTOMATIC_CRON_BACKUP",
            backup_date: new Date().toISOString(),
            database_provider: "PostgreSQL (Supabase)"
          },
          database: fullBackupData
        };

        const backupFolder = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupFolder)) {
          fs.mkdirSync(backupFolder, { recursive: true });
        }

        const now = new Date().toLocaleTimeString('es-CL', { hour12: false }).replace(/:/g, '-');
        const today = new Date().toISOString().split('T')[0];
        const filePath = path.join(backupFolder, `cron_backup_${today}_${now}.json`);

        fs.writeFileSync(filePath, JSON.stringify(masterBackup, null, 2));
        console.log(`✅ [CRON] ¡Respaldo guardado con éxito!: ${filePath}`);

      } catch (error) {
        console.error("❌ [CRON] Error crítico durante la ejecución del respaldo:", error);
      }
    }, { scheduled: true, timezone: "America/Santiago" } as any);
  }
}
