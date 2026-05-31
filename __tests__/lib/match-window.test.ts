
import { getMatchWindow, isMatchExpired } from "@/lib/match-window";

// Congela el tiempo en una fecha fija para todos los tests
const FIXED_NOW = new Date("2026-05-30T19:30:00.000Z");

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

describe("getMatchWindow", () => {
  it("está activo si la hora actual está dentro de ±15 min del partido", () => {
    const matchDate = new Date("2026-05-30");
    const matchTime = new Date("1970-01-01T19:30:00.000Z");

    const window = getMatchWindow(matchDate, matchTime);

    expect(window.is_active).toBe(true);
  });

  it("no está activo si el partido es en el futuro lejano", () => {
    const matchDate = new Date("2026-06-01");
    const matchTime = new Date("1970-01-01T19:30:00.000Z");

    const window = getMatchWindow(matchDate, matchTime);

    expect(window.is_active).toBe(false);
  });
});

describe("isMatchExpired", () => {
  it("expiró si pasaron más de 15 min desde la hora del partido", () => {
    const matchDate = new Date("2026-05-30");
    const matchTime = new Date("1970-01-01T19:00:00.000Z"); // 30 min antes del now fijo

    expect(isMatchExpired(matchDate, matchTime)).toBe(true);
  });

  it("no expiró si el partido es en el futuro", () => {
    const matchDate = new Date("2026-05-30");
    const matchTime = new Date("1970-01-01T20:00:00.000Z");

    expect(isMatchExpired(matchDate, matchTime)).toBe(false);
  });
});
