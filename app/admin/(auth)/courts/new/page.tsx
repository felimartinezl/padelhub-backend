"use client";
import { useActionState } from "react";
import { createCourtAction } from "../actions";
import Link from "next/link";

const SURFACES = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "covered", label: "Techada" },
];

export default function NewCourtPage() {
  const [state, action, isPending] = useActionState(createCourtAction, null);

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/courts" className="text-indigo-600 hover:text-indigo-800 text-sm">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nueva cancha</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <form action={action} className="space-y-4">
          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {state.error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Nombre</label>
            <input
              name="name"
              type="text"
              required
              placeholder="Ej: Cancha 1 - Club Padel Norte"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Dirección</label>
            <input
              name="address"
              type="text"
              required
              placeholder="Ej: Av. Providencia 1234"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Zona</label>
            <input
              name="zone"
              type="text"
              required
              placeholder="Ej: Providencia"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Superficie</label>
            <select
              name="surface"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SURFACES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {isPending ? "Creando..." : "Crear cancha"}
            </button>
            <Link
              href="/admin/courts"
              className="flex-1 text-center border border-gray-300 text-gray-800 hover:text-gray-950 py-2 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
