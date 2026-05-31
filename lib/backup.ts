import * as fs   from "fs";
import * as path from "path";

export function getModelNames(prismaClient: Record<string, unknown>): string[] {
  return Object.keys(prismaClient).filter(
    (key) => !key.startsWith("_") && !key.startsWith("$")
  );
}

export interface BackupMetadata {
  type: string;
  backup_date: string;
  database_provider: string;
}

export function buildBackupMetadata(type: string): BackupMetadata {
  return {
    type,
    backup_date:       new Date().toISOString(),
    database_provider: "PostgreSQL (Supabase)",
  };
}

export function serializeBackup(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function generateBackupFilename(prefix: string, date: Date = new Date()): string {
  const iso     = date.toISOString();          // "2025-05-26T02:00:01.000Z"
  const dateStr = iso.split("T")[0];           // "2025-05-26"
  const timeStr = iso.split("T")[1]
    .split(".")[0]                             // "02:00:01"
    .replace(/:/g, "-");                       // "02-00-01"
  return `${prefix}_backup_${dateStr}_${timeStr}.json`;
}

export async function runBackupJob(
  prismaClient: Record<string, any>,
  backupsDir: string,
  date: Date = new Date()
): Promise<string> {
  const modelNames = getModelNames(prismaClient);
  const database: Record<string, any> = {};

  for (const model of modelNames) {
    database[model] = await prismaClient[model].findMany();
  }

  const masterBackup = {
    backup_info: buildBackupMetadata("AUTOMATIC_CRON_BACKUP"),
    database,
  };

  fs.mkdirSync(backupsDir, { recursive: true });

  const filename = generateBackupFilename("cron", date);
  const filePath = path.join(backupsDir, filename);
  fs.writeFileSync(filePath, serializeBackup(masterBackup));

  return filePath;
}
