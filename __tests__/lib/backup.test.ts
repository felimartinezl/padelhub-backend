import {
  getModelNames,
  buildBackupMetadata,
  serializeBackup,
  generateBackupFilename,
} from "@/lib/backup";

// ════════════════════════════════════════════════════════════════════════════
// BU-01 | Iteración dinámica de modelos Prisma
//
// Pre-condición : cliente Prisma simulado con 6 modelos + claves internas
// Pasos         : llamar getModelNames(mockPrisma)
// Resultado     : array con exactamente los 6 nombres de modelo, en orden
// ════════════════════════════════════════════════════════════════════════════
describe("BU-01 | getModelNames — iteración dinámica de modelos Prisma", () => {
  const mockPrisma = {
    users:          {},
    matches:        {},
    match_players:  {},
    match_results:  {},
    mmr_history:    {},
    refresh_tokens: {},
    // Claves internas que deben ser filtradas
    $connect:     jest.fn(),
    $disconnect:  jest.fn(),
    $transaction: jest.fn(),
    $executeRaw:  jest.fn(),
    _engine:      {},
    _middlewares: {},
  };

  it("retorna exactamente los 6 modelos sin claves internas de Prisma", () => {
    const result = getModelNames(mockPrisma as any);

    expect(result).toEqual([
      "users",
      "matches",
      "match_players",
      "match_results",
      "mmr_history",
      "refresh_tokens",
    ]);
  });

  it("no incluye claves que empiecen con '$'", () => {
    const result = getModelNames(mockPrisma as any);
    expect(result.every((k) => !k.startsWith("$"))).toBe(true);
  });

  it("no incluye claves que empiecen con '_'", () => {
    const result = getModelNames(mockPrisma as any);
    expect(result.every((k) => !k.startsWith("_"))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BU-02 | Estructura correcta de backup_info
//
// Pre-condición : tiempo del sistema fijado en 2025-05-26T02:00:01.000Z
// Pasos         : llamar buildBackupMetadata('MANUAL_HTTP_BACKUP')
// Resultado     : objeto con type, backup_date ISO 8601 válido y database_provider
// ════════════════════════════════════════════════════════════════════════════
describe("BU-02 | buildBackupMetadata — estructura de backup_info", () => {
  const FIXED_DATE = new Date("2025-05-26T02:00:01.000Z");

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_DATE);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("contiene el type recibido como argumento", () => {
    const meta = buildBackupMetadata("MANUAL_HTTP_BACKUP");
    expect(meta.type).toBe("MANUAL_HTTP_BACKUP");
  });

  it("backup_date es una cadena ISO 8601 válida", () => {
    const meta = buildBackupMetadata("MANUAL_HTTP_BACKUP");
    // Formato: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(meta.backup_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("backup_date es parseable como Date y corresponde al tiempo fijado", () => {
    const meta = buildBackupMetadata("MANUAL_HTTP_BACKUP");
    const parsed = new Date(meta.backup_date);
    expect(parsed.toISOString()).toBe(FIXED_DATE.toISOString());
  });

  it("database_provider es 'PostgreSQL (Supabase)'", () => {
    const meta = buildBackupMetadata("MANUAL_HTTP_BACKUP");
    expect(meta.database_provider).toBe("PostgreSQL (Supabase)");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BU-03 | Serialización JSON del respaldo
//
// Pre-condición : datos de prueba con caracteres especiales, fechas y nulls
// Pasos         : llamar serializeBackup(mockData)
// Resultado     : JSON válido, fechas como strings ISO, sin pérdida de datos
// ════════════════════════════════════════════════════════════════════════════
describe("BU-03 | serializeBackup — serialización JSON del respaldo", () => {
  const mockData = {
    name:    "Café & Pádel <Club>",
    date:    new Date("2025-05-26T02:00:01.000Z"),
    score:   6.5,
    players: ["José", "María"],
    config:  { active: true, slots: null },
  };

  let json: string;
  let parsed: Record<string, any>;

  beforeAll(() => {
    json   = serializeBackup(mockData);
    parsed = JSON.parse(json);       // lanza si el JSON es inválido
  });

  it("produce un string JSON válido (parseable sin errores)", () => {
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("preserva strings con caracteres especiales sin pérdida", () => {
    expect(parsed.name).toBe("Café & Pádel <Club>");
  });

  it("preserva números y arrays correctamente", () => {
    expect(parsed.score).toBe(6.5);
    expect(parsed.players).toEqual(["José", "María"]);
  });

  it("preserva objetos anidados y valores null", () => {
    expect(parsed.config).toEqual({ active: true, slots: null });
  });

  it("serializa Date como string ISO 8601", () => {
    expect(typeof parsed.date).toBe("string");
    expect(parsed.date).toBe("2025-05-26T02:00:01.000Z");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BU-04 | Nombre de archivo con timestamp correcto
//
// Pre-condición : fecha mock 2025-05-26T02:00:01.000Z
// Pasos         : llamar generateBackupFilename('cron', mockDate)
// Resultado     : 'cron_backup_2025-05-26_02-00-01.json'
// ════════════════════════════════════════════════════════════════════════════
describe("BU-04 | generateBackupFilename — nombre de archivo con timestamp", () => {
  const MOCK_DATE = new Date("2025-05-26T02:00:01.000Z");

  it("genera el nombre correcto para la fecha mock dada", () => {
    expect(generateBackupFilename("cron", MOCK_DATE))
      .toBe("cron_backup_2025-05-26_02-00-01.json");
  });

  it("respeta el prefijo recibido como argumento", () => {
    expect(generateBackupFilename("manual", MOCK_DATE))
      .toBe("manual_backup_2025-05-26_02-00-01.json");
  });

  it("usa la fecha actual si no se provee fecha explícita", () => {
    jest.useFakeTimers();
    jest.setSystemTime(MOCK_DATE);

    expect(generateBackupFilename("cron"))
      .toBe("cron_backup_2025-05-26_02-00-01.json");

    jest.useRealTimers();
  });
});
