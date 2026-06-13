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
    const { sendPushNotifications } = await import('@/lib/notifications');

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

    // Recordatorio de partido 1 hora antes (ventana estricta de 15 min para no duplicar)
    cron.schedule('*/15 * * * *', async () => {
      try {
        const now = new Date();
        const windowStart = new Date(now.getTime() + 60 * 60 * 1000);
        const windowEnd   = new Date(now.getTime() + 75 * 60 * 1000);

        const upcoming = await prisma.matches.findMany({
          where: { status: { in: ['open', 'confirmed'] } },
          select: {
            id: true,
            club: true,
            match_date: true,
            match_time: true,
            match_players: {
              where: { status: 'confirmed' },
              select: { user_id: true },
            },
          },
        });

        const toRemind = upcoming.filter((m) => {
          const d = new Date(m.match_date);
          const t = new Date(m.match_time);
          const matchDateTime = new Date(Date.UTC(
            d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
            t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(),
          ));
          return matchDateTime >= windowStart && matchDateTime < windowEnd;
        });

        for (const match of toRemind) {
          const playerIds = match.match_players.map((p) => p.user_id);
          if (playerIds.length === 0) continue;
          await sendPushNotifications(playerIds, {
            title: "Recordatorio de partido",
            body: `Tu partido en ${match.club} comienza en 1 hora. ¡Prepárate!`,
            data: { match_id: match.id, type: "match_reminder" },
          });
          console.log(`[CRON] Recordatorio enviado para partido ${match.id} (${playerIds.length} jugadores)`);
        }
      } catch (error) {
        console.error('[CRON] Error al enviar recordatorios de partido:', error);
      }
    }, { scheduled: true, timezone: 'America/Santiago' } as any);

    // Auto-reactivación de usuarios con suspensión expirada (cada hora)
    cron.schedule('0 * * * *', async () => {
      try {
        const { count } = await prisma.users.updateMany({
          where: {
            is_active: false,
            suspended_until: { not: null, lte: new Date() },
          },
          data: {
            is_active: true,
            suspended_until: null,
            updated_at: new Date(),
          },
        });
        if (count > 0) {
          console.log(`[CRON] ${count} usuario(s) reactivado(s) por suspensión expirada.`);
        }
      } catch (error) {
        console.error('[CRON] Error al reactivar usuarios suspendidos:', error);
      }
    }, { scheduled: true, timezone: 'America/Santiago' } as any);

    // Limpieza de mensajes de chat 24h después de finalizado el partido (diario a las 3 AM)
    cron.schedule('0 3 * * *', async () => {
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const { count } = await prisma.match_messages.deleteMany({
          where: {
            matches: { status: { in: ['finished', 'cancelled'] }, updated_at: { lte: cutoff } },
          },
        });
        if (count > 0) {
          console.log(`[CRON] ${count} mensaje(s) de chat eliminado(s) de partidos finalizados.`);
        }
      } catch (error) {
        console.error('[CRON] Error al limpiar mensajes de chat:', error);
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
