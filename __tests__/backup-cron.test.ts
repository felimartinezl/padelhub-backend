// jest.mock is hoisted before imports by Jest — both this file and lib/backup.ts
// receive the same mocked fs module, so calls are intercepted correctly.
jest.mock("fs", () => ({
  mkdirSync:     jest.fn(),
  writeFileSync: jest.fn(),
  existsSync:    jest.fn(),
}));

import * as fs   from "fs";
import * as path from "path";
import { runBackupJob } from "@/lib/backup";
import { register }    from "@/instrumentation";

// ════════════════════════════════════════════════════════════════════════════
// BI-04 | Cron persiste archivo en /backups/
//
// Pre-condición : directorio de backups accesible; Prisma con datos
// Pasos         : llamar runBackupJob(mockPrisma, dir, date)
// Resultado     : fs.writeFileSync llamado; contenido JSON válido; tamaño > 0
// ════════════════════════════════════════════════════════════════════════════
describe("BI-04 | runBackupJob persiste archivo en el sistema de archivos", () => {
  const MOCK_DATE = new Date("2025-05-26T02:00:01.000Z");
  const BACKUP_DIR = "/tmp/test-backups";
  const EXPECTED_FILENAME = "cron_backup_2025-05-26_02-00-01.json";

  const mockPrisma = {
    users:          { findMany: jest.fn().mockResolvedValue([{ id: "u1", name: "User" }]) },
    matches:        { findMany: jest.fn().mockResolvedValue([{ id: "m1", club: "Club" }]) },
    match_players:  { findMany: jest.fn().mockResolvedValue([{ id: "mp1" }]) },
    match_results:  { findMany: jest.fn().mockResolvedValue([{ id: "mr1" }]) },
    mmr_history:    { findMany: jest.fn().mockResolvedValue([{ id: "mmr1" }]) },
    refresh_tokens: { findMany: jest.fn().mockResolvedValue([{ id: "rt1" }]) },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.users.findMany.mockResolvedValue([{ id: "u1", name: "User" }]);
    mockPrisma.matches.findMany.mockResolvedValue([{ id: "m1", club: "Club" }]);
    mockPrisma.match_players.findMany.mockResolvedValue([{ id: "mp1" }]);
    mockPrisma.match_results.findMany.mockResolvedValue([{ id: "mr1" }]);
    mockPrisma.mmr_history.findMany.mockResolvedValue([{ id: "mmr1" }]);
    mockPrisma.refresh_tokens.findMany.mockResolvedValue([{ id: "rt1" }]);
  });

  it("llama mkdirSync para asegurar que el directorio existe", async () => {
    await runBackupJob(mockPrisma, BACKUP_DIR, MOCK_DATE);

    console.log("\n[BI-04] mkdirSync llamado:", (fs.mkdirSync as jest.Mock).mock.calls.length > 0);
    expect(fs.mkdirSync).toHaveBeenCalledWith(BACKUP_DIR, { recursive: true });
  });

  it("llama writeFileSync con el nombre de archivo correcto", async () => {
    await runBackupJob(mockPrisma, BACKUP_DIR, MOCK_DATE);

    const [writtenPath] = (fs.writeFileSync as jest.Mock).mock.calls[0] as [string, string];
    const basename      = path.basename(writtenPath);

    console.log("\n[BI-04] Archivo creado:", basename);
    expect(basename).toBe(EXPECTED_FILENAME);
  });

  it("el contenido escrito es JSON válido con backup_info y database", async () => {
    await runBackupJob(mockPrisma, BACKUP_DIR, MOCK_DATE);

    const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
    console.log("\n[BI-04] Tamaño del contenido:", writtenContent.length, "bytes");

    expect(writtenContent.length).toBeGreaterThan(0);  // tamaño > 0
    const parsed = JSON.parse(writtenContent);          // JSON válido (no lanza)

    expect(parsed.backup_info.type).toBe("AUTOMATIC_CRON_BACKUP");
    expect(parsed.backup_info.database_provider).toBe("PostgreSQL (Supabase)");
    expect(parsed).toHaveProperty("database");
    expect(parsed.database).toHaveProperty("users");
    expect(Array.isArray(parsed.database.users)).toBe(true);
  });

  it("retorna la ruta completa del archivo creado", async () => {
    const filePath = await runBackupJob(mockPrisma, BACKUP_DIR, MOCK_DATE);

    console.log("\n[BI-04] filePath retornado:", filePath);
    expect(path.basename(filePath)).toBe(EXPECTED_FILENAME);
    // Normalize backslashes (Windows) to forward slashes before comparing
    expect(filePath.replace(/\\/g, "/")).toContain(BACKUP_DIR);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BI-05 | Cron no ejecuta en runtime Edge
//
// Pre-condición : NEXT_RUNTIME='edge'
// Pasos         : llamar register()
// Resultado     : sin archivo generado; log 'Cron deshabilitado en entorno no-Node.js'
// ════════════════════════════════════════════════════════════════════════════
describe("BI-05 | register() con NEXT_RUNTIME=edge no inicia el cron", () => {
  let originalRuntime: string | undefined;
  let logSpy: jest.SpyInstance;

  beforeAll(() => {
    originalRuntime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "edge";
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  beforeEach(() => {
    // Clear call history so each test starts fresh; implementations are preserved.
    jest.clearAllMocks();
    logSpy.mockImplementation(() => {});
  });

  afterAll(() => {
    process.env.NEXT_RUNTIME = originalRuntime;
    logSpy.mockRestore();
  });

  it("no genera ningún archivo de backup", async () => {
    await register();

    console.log("\n[BI-05] writeFileSync llamado:", (fs.writeFileSync as jest.Mock).mock.calls.length);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("emite el log 'Cron deshabilitado en entorno no-Node.js'", async () => {
    await register();

    const logMessages = (logSpy.mock.calls as string[][])
      .map((args) => args.join(" "));

    console.log("\n[BI-05] Mensajes de log:", logMessages);
    expect(logMessages.some((m) =>
      m.includes("Cron deshabilitado en entorno no-Node.js")
    )).toBe(true);
  });
});
