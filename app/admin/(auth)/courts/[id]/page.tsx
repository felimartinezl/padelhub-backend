import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditForm from "./edit-form";
import ScheduleForm from "./schedule-form";
import { deleteScheduleAction, toggleScheduleAction } from "./actions";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export default async function CourtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const court = await prisma.courts.findUnique({
    where: { id },
    include: { court_schedules: { orderBy: { day_of_week: "asc" } } },
  });

  if (!court) notFound();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/courts" className="text-indigo-600 hover:text-indigo-800 text-sm">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{court.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Información de la cancha</h2>
          <EditForm court={court} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Horarios</h2>

          {court.court_schedules.length === 0 ? (
            <p className="text-gray-600 text-sm mb-6">No hay horarios configurados.</p>
          ) : (
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-semibold text-gray-800">Día</th>
                  <th className="text-left py-2 font-semibold text-gray-800">Apertura</th>
                  <th className="text-left py-2 font-semibold text-gray-800">Cierre</th>
                  <th className="text-left py-2 font-semibold text-gray-800">Disponible</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {court.court_schedules.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 text-gray-950 font-medium">{DAYS[s.day_of_week]}</td>
                    <td className="py-2 text-gray-800">{formatTime(s.open_time)}</td>
                    <td className="py-2 text-gray-800">{formatTime(s.close_time)}</td>
                    <td className="py-2">
                      <form action={toggleScheduleAction}>
                        <input type="hidden" name="schedule_id" value={s.id} />
                        <input type="hidden" name="court_id" value={id} />
                        <input type="hidden" name="is_available" value={String(s.is_available)} />
                        <button
                          type="submit"
                          className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${
                            s.is_available
                              ? "bg-green-50 text-green-700 hover:bg-green-100"
                              : "bg-red-50 text-red-600 hover:bg-red-100"
                          }`}
                        >
                          {s.is_available ? "Sí" : "No"}
                        </button>
                      </form>
                    </td>
                    <td className="py-2">
                      <form action={deleteScheduleAction}>
                        <input type="hidden" name="schedule_id" value={s.id} />
                        <input type="hidden" name="court_id" value={id} />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-800 text-xs cursor-pointer"
                        >
                          Eliminar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Agregar / editar horario
            </h3>
            <ScheduleForm courtId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
