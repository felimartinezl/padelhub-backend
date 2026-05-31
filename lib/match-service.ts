import { match_status, winner_team } from "@prisma/client";
import { prisma } from "./prisma";
import { ConflictError, ValidationError } from "./errors";

export interface CreateMatchInput {
  date:      Date | string;
  court:     string;
  playerIds: string[];
}

export interface MatchSet {
  teamA: number;
  teamB: number;
}

export interface RegisterResultInput {
  sets:         MatchSet[];
  winnerId:     string;   // userId del ganador — determina qué equipo ganó
  registeredBy?: string;  // userId de quien registra; por defecto = winnerId
}

// ─────────────────────────────────────────────────────────────────────────────
// createMatch
// Crea un partido dobles con exactamente 4 jugadores.
// Los primeros 2 van a team_a, los últimos 2 a team_b.
// Lanza ValidationError si la cantidad o unicidad de jugadores no es correcta.
// ─────────────────────────────────────────────────────────────────────────────
export async function createMatch(input: CreateMatchInput) {
  if (input.playerIds.length !== 4) {
    throw new ValidationError("Se requieren exactamente 4 jugadores");
  }

  if (new Set(input.playerIds).size !== input.playerIds.length) {
    throw new ValidationError("Jugadores duplicados no permitidos");
  }

  return prisma.$transaction(async (tx) => {
    const match = await tx.matches.create({
      data: {
        organizer_id: input.playerIds[0],
        club:         input.court,
        format:       "doubles",
        status:       "open",
        match_date:   new Date(input.date),
        match_time:   new Date(input.date),
      },
    });

    await tx.match_players.createMany({
      data: input.playerIds.map((userId, i) => ({
        match_id: match.id,
        user_id:  userId,
        team:     i < 2 ? "team_a" : "team_b",
        status:   "confirmed",
      })),
    });

    return tx.matches.findUnique({
      where:   { id: match.id },
      include: { match_players: true },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// updateMatchStatus
// Actualiza el estado del partido y refresca updated_at.
// ─────────────────────────────────────────────────────────────────────────────
export async function updateMatchStatus(matchId: string, status: match_status) {
  return prisma.matches.update({
    where: { id: matchId },
    data:  { status, updated_at: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// registerResult
// Registra el resultado de un partido en progreso y lo marca como 'finished'.
// Lanza ConflictError si el partido ya tiene resultado (status 'finished').
// ─────────────────────────────────────────────────────────────────────────────
export async function registerResult(matchId: string, input: RegisterResultInput) {
  const match = await prisma.matches.findUnique({
    where:   { id: matchId },
    include: { match_players: true },
  });

  if (!match) {
    throw new ValidationError("Partido no encontrado");
  }

  if (match.status === "finished") {
    throw new ConflictError("El partido ya tiene resultado registrado");
  }

  if (match.status !== "in_progress") {
    throw new ValidationError("El partido no está en progreso");
  }

  const winnerPlayer  = match.match_players.find((mp) => mp.user_id === input.winnerId);
  const winnerTeam    = (winnerPlayer?.team ?? "team_a") as winner_team;
  const scoreTeamA    = input.sets.map((s) => s.teamA).join("-");
  const scoreTeamB    = input.sets.map((s) => s.teamB).join("-");
  const registeredBy  = input.registeredBy ?? input.winnerId;

  return prisma.$transaction(async (tx) => {
    const result = await tx.match_results.create({
      data: {
        match_id:      matchId,
        registered_by: registeredBy,
        score_team_a:  scoreTeamA,
        score_team_b:  scoreTeamB,
        winner:        winnerTeam,
      },
    });

    await tx.matches.update({
      where: { id: matchId },
      data:  { status: "finished", updated_at: new Date() },
    });

    return result;
  });
}
