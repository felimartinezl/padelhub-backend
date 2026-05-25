import { prisma } from "@/lib/prisma";
import Link from "next/link";
import DeleteButton from "./delete-button";

const SURFACE_LABELS: Record<string, string> = {
  indoor: "Indoor",
  outdoor: "Outdoor",
  covered: "Techada",
};

const PAGE_SIZE = 20;

export default async function CourtsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; active?: string }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() || "";
  const page = Math.max(1, parseInt(params.page || "1"));
  const active = params.active || "";

  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { zone: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
    ];
  }
  if (active !== "") where.is_active = active === "true";

  const [courts, total] = await Promise.all([
    prisma.courts.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { _count: { select: { court_schedules: true } } },
    }),
    prisma.courts.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildHref(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { search, page: String(page), active, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/admin/courts?${p.toString()}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Canchas</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">{total} en total</span>
          <Link
            href="/admin/courts/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Nueva cancha
          </Link>
        </div>
      </div>

      <form method="GET" className="flex flex-wrap gap-3 mb-6">
        <input
          name="search"
          type="text"
          defaultValue={search}
          placeholder="Buscar por nombre, zona o dirección..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-72"
        />
        <select
          name="active"
          defaultValue={active}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todas</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </select>
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          Buscar
        </button>
        <a
          href="/admin/courts"
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
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Zona</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Dirección</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Superficie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Horarios</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-gray-600 py-12">
                    No se encontraron canchas
                  </td>
                </tr>
              ) : (
                courts.map((court) => (
                  <tr key={court.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-950">{court.name}</td>
                    <td className="px-4 py-3 text-gray-800">{court.zone}</td>
                    <td className="px-4 py-3 text-gray-800">{court.address}</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                        {SURFACE_LABELS[court.surface] ?? court.surface}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {court._count.court_schedules} días
                    </td>
                    <td className="px-4 py-3">
                      {court.is_active ? (
                        <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                          Activa
                        </span>
                      ) : (
                        <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-medium">
                          Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/courts/${court.id}`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                        >
                          Editar
                        </Link>
                        <DeleteButton courtId={court.id} courtName={court.name} />
                      </div>
                    </td>
                  </tr>
                ))
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
