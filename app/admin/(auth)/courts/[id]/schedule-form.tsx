"use client";
import { useActionState } from "react";
import { addScheduleAction } from "./actions";

const DAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

export default function ScheduleForm({ courtId }: { courtId: string }) {
  const [state, action, isPending] = useActionState(addScheduleAction, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="court_id" value={courtId} />

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
          Horario guardado correctamente
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Día</label>
          <select
            name="day_of_week"
            required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Apertura</label>
          <input
            name="open_time"
            type="time"
            required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Cierre</label>
          <input
            name="close_time"
            type="time"
            required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Agregar / Actualizar"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Si ya existe un horario para ese día, se actualizará con los nuevos valores.
      </p>
    </form>
  );
}
