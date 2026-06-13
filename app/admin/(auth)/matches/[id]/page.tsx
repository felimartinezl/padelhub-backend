import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import AnnulButton from "./annul-button";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open:        { label: "Abierto",     color: "bg-blue-50 text-blue-700" },
  confirmed:   { label: "Confirmado",  color: "bg-green-50 text-green-700" },
  in_progress: { label: "En juego",    color: "bg-amber-50 text-amber-700" },
  finished:    { label: "Finalizado",  color: "bg-gray-100 text-gray-700" },
  cancelled:   { label: "Cancelado",   color: "bg-red-50 text-red-600" },
};

const FORMAT_LABELS: Record<string, string> = {
  doubles: "Dobles",
  singles: "Singles",
};

const PLAYER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Pendiente", color: "text-amber-600" },
  confirmed: { label: "Confirmado", color: "text-green-600" },
  rejected:  { label: "Rechazado", color: "text-red-600" },
  removed:   { label: "Eliminado", color: "text-gray-500" },
};

const WINNER_LABELS: Record<string, string> = {
  team_a: "Equipo A",
  team_b: "Equipo B",
  draw:   "Empate",
};

function formatTime(t: Date) {
  const d = new Date(t);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const match = await prisma.matches.findUnique({
    where: { id },
    select: {
      id: true,
      club: true,
      format: true,
      status: true,
      match_date: true,
      match_time: true,
      created_at: true,
      users: { select: { id: true, name: true, zone: true } },
      match_players: {
        orderBy: [{ team: "asc" }, { joined_at: "asc" }],
        select: {
          team: true,
          status: true,
          users: { select: { id: true, name: true, mmr: true } },
        },
      },
      match_results: {
        select: {
          score_team_a: true,
          score_team_b: true,
          winner: true,
          confirmed: true,
          registered_by: true,
          registered_at: true,
          confirmed_by: true,
          confirmed_at: true,
        },
      },
    },
  });

  if (!match) notFound();

  const result = match.match_results;

  const [registeredByUser, confirmedByUser] = result
    ? await Promise.all([
        prisma.users.findUnique({ where: { id: result.registered_by }, select: { name: true } }),
        result.confirmed_by
          ? prisma.users.findUnique({ where: { id: result.confirmed_by }, select: { name: true } })
          : Promise.resolve(null),
      ])
    : [null, null];

  const teamA = match.match_players.filter((p) => p.team === "team_a");
  const teamB = match.match_players.filter((p) => p.team === "team_b");
  const st = STATUS_LABELS[match.status] ?? { label: match.status, color: "bg-gray-100 text-gray-700" };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/matches" className="text-gray-700 hover:text-gray-950 text-sm transition-colors">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold text-gray-950">{match.club}</h1>
        <span className={`${st.color} px-2 py-0.5 rounded text-xs font-medium`}>{st.label}</span>
      </div>

      {/* Info general */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-950 mb-4">Información del partido</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Club</p>
            <p className="font-medium text-gray-950">{match.club}</p>
          </div>
          <div>
            <p className="text-gray-600">Formato</p>
            <p className="font-medium text-gray-950">{FORMAT_LABELS[match.format] ?? match.format}</p>
          </div>
          <div>
            <p className="text-gray-600">Fecha</p>
            <p className="font-medium text-gray-950">
              {new Date(match.match_date).toLocaleDateString("es-CL", { timeZone: "UTC" })}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Hora</p>
            <p className="font-medium text-gray-950">{formatTime(match.match_time)}</p>
          </div>
          <div>
            <p className="text-gray-600">Organizador</p>
            <p className="font-medium text-gray-950">{match.users.name}</p>
          </div>
          <div>
            <p className="text-gray-600">Zona</p>
            <p className="font-medium text-gray-950">{match.users.zone}</p>
          </div>
          <div>
            <p className="text-gray-600">Creado</p>
            <p className="font-medium text-gray-950">
              {new Date(match.created_at).toLocaleString("es-CL")}
            </p>
          </div>
          <div>
            <p className="text-gray-600">ID</p>
            <p className="font-mono text-xs text-gray-700 break-all">{match.id}</p>
          </div>
        </div>
      </div>

      {/* Jugadores */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-950 mb-4">
          Jugadores ({match.match_players.length})
        </h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">Equipo A</p>
            {teamA.length === 0 ? (
              <p className="text-sm text-gray-400">Sin jugadores</p>
            ) : (
              <ul className="space-y-2">
                {teamA.map((p) => {
                  const ps = PLAYER_STATUS_LABELS[p.status] ?? { label: p.status, color: "text-gray-700" };
                  return (
                    <li key={p.users.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-gray-950">{p.users.name}</span>
                        <span className="text-gray-500 ml-2 text-xs">MMR {p.users.mmr}</span>
                      </div>
                      <span className={`text-xs ${ps.color}`}>{ps.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-3">Equipo B</p>
            {teamB.length === 0 ? (
              <p className="text-sm text-gray-400">Sin jugadores</p>
            ) : (
              <ul className="space-y-2">
                {teamB.map((p) => {
                  const ps = PLAYER_STATUS_LABELS[p.status] ?? { label: p.status, color: "text-gray-700" };
                  return (
                    <li key={p.users.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-gray-950">{p.users.name}</span>
                        <span className="text-gray-500 ml-2 text-xs">MMR {p.users.mmr}</span>
                      </div>
                      <span className={`text-xs ${ps.color}`}>{ps.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Resultado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-950 mb-4">Resultado</h2>

        {!result ? (
          <p className="text-sm text-gray-500">No hay resultado registrado para este partido.</p>
        ) : (
          <>
            <div className="flex items-center gap-6 mb-6">
              <div className="text-center">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Equipo A</p>
                <p className="text-4xl font-bold text-gray-950">{result.score_team_a}</p>
              </div>
              <p className="text-2xl text-gray-400 font-light">—</p>
              <div className="text-center">
                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-1">Equipo B</p>
                <p className="text-4xl font-bold text-gray-950">{result.score_team_b}</p>
              </div>
              <div className="ml-6 pl-6 border-l border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Ganador</p>
                <p className="font-semibold text-gray-950">{WINNER_LABELS[result.winner] ?? result.winner}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <p className="text-gray-600">Registrado por</p>
                <p className="font-medium text-gray-950">{registeredByUser?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-600">Registrado</p>
                <p className="font-medium text-gray-950">
                  {new Date(result.registered_at).toLocaleString("es-CL")}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Estado</p>
                {result.confirmed ? (
                  <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium">Confirmado</span>
                ) : (
                  <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">Pendiente de confirmación</span>
                )}
              </div>
              {result.confirmed && result.confirmed_at && (
                <div>
                  <p className="text-gray-600">Confirmado por</p>
                  <p className="font-medium text-gray-950">
                    {confirmedByUser?.name ?? "—"}{" "}
                    <span className="text-gray-500 text-xs">
                      ({new Date(result.confirmed_at).toLocaleString("es-CL")})
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500 mb-3">
                {result.confirmed
                  ? "Anular revertirá el MMR de todos los jugadores y el partido volverá a estado Confirmado."
                  : "Eliminar el resultado pendiente permite que los jugadores registren uno nuevo."}
              </p>
              <AnnulButton matchId={match.id} isConfirmed={result.confirmed} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
