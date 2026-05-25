"use client";
import { useActionState } from "react";
import { updateCourtAction } from "./actions";
import Link from "next/link";

const SURFACES = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "covered", label: "Techada" },
];

type Court = {
  id: string;
  name: string;
  address: string;
  zone: string;
  surface: string;
  is_active: boolean;
};

export default function EditForm({ court }: { court: Court }) {
  const [state, action, isPending] = useActionState(updateCourtAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="court_id" value={court.id} />

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
          defaultValue={court.name}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-1">Dirección</label>
        <input
          name="address"
          type="text"
          defaultValue={court.address}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-1">Zona</label>
        <input
          name="zone"
          type="text"
          defaultValue={court.zone}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-1">Superficie</label>
        <select
          name="surface"
          defaultValue={court.surface}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {SURFACES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-1">Estado</label>
        <select
          name="is_active"
          defaultValue={court.is_active ? "true" : "false"}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="true">Activa</option>
          <option value="false">Inactiva</option>
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
        <Link
          href="/admin/courts"
          className="flex-1 text-center border border-gray-300 text-gray-800 hover:text-gray-950 py-2 rounded-lg text-sm transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
