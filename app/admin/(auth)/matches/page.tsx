import { prisma } from "@/lib/prisma";
import Link from "next/link";

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

const PAGE_SIZE = 50;

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    date?: string;
    zone?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const status = params.status || "";
  const date   = params.date   || "";
  const zone   = params.zone?.trim() || "";
  const page   = Math.max(1, parseInt(params.page || "1"));

  const where: any = {};
  if (status) where.status = status;
  if (date)   where.match_date = new Date(date);
  if (zone)   where.users = { zone: { contains: zone, mode: "insensitive" } };

  const [matches, total] = await Promise.all([
    prisma.matches.findMany({
      where,
      orderBy: [{ match_date: "desc" }, { match_time: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        club: true,
        format: true,
        status: true,
        match_date: true,
        match_time: true,
        users: { select: { name: true, zone: true } },
        _count: { select: { match_players: { where: { status: "confirmed" } } } },
        match_results: { select: { confirmed: true } },
      },
    }),
    prisma.matches.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildHref(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { status, date, zone, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/admin/matches?${p.toString()}`;
  }

  function formatTime(t: Date) {
    const d = new Date(t);
    return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Partidos</h1>
        <span className="text-sm text-gray-700">{total} en total</span>
      </div>

      <form method="GET" className="flex flex-wrap gap-3 mb-6">
        <select
          name="status"
          defaultValue={status}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <input
          name="date"
          type="date"
          defaultValue={date}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          name="zone"
          type="text"
          defaultValue={zone}
          placeholder="Zona del organizador..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-52"
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          Buscar
        </button>
        <a
          href="/admin/matches"
          className="border border-gray-300 text-gray-800 hover:text-gray-950 px-4 py-2 rounded-lg text-sm transition-colors"
        >
          Limpiar
        </a>
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Club</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Formato</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Hora</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Organizador</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Zona</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Confirmados</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Resultado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-gray-600 py-12">
                    No se encontraron partidos
                  </td>
                </tr>
              ) : (
                matches.map((match) => {
                  const st = STATUS_LABELS[match.status] ?? { label: match.status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={match.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-950">{match.club}</td>
                      <td className="px-4 py-3 text-gray-800">{FORMAT_LABELS[match.format] ?? match.format}</td>
                      <td className="px-4 py-3 text-gray-800">
                        {new Date(match.match_date).toLocaleDateString("es-CL")}
                      </td>
                      <td className="px-4 py-3 text-gray-800">{formatTime(match.match_time)}</td>
                      <td className="px-4 py-3">
                        <span className={`${st.color} px-2 py-0.5 rounded text-xs font-medium`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">{match.users.name}</td>
                      <td className="px-4 py-3 text-gray-800">{match.users.zone}</td>
                      <td className="px-4 py-3 text-gray-800 text-center">
                        {match._count.match_players}
                      </td>
                      <td className="px-4 py-3">
                        {match.match_results ? (
                          match.match_results.confirmed ? (
                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium">Confirmado</span>
                          ) : (
                            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">Pendiente</span>
                          )
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/matches/${match.id}`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-sm text-gray-700">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={buildHref({ page: String(page - 1) })}
                className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-800 hover:text-gray-950 transition-colors"
              >
                Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={buildHref({ page: String(page + 1) })}
                className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-800 hover:text-gray-950 transition-colors"
              >
                Siguiente
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
