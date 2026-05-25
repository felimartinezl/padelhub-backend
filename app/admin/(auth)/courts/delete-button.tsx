"use client";
import { useTransition } from "react";
import { deleteCourtAction } from "./actions";

export default function DeleteButton({
  courtId,
  courtName,
}: {
  courtId: string;
  courtName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`¿Eliminar la cancha "${courtName}"? Esta acción no se puede deshacer.`)) return;
    const fd = new FormData();
    fd.append("court_id", courtId);
    startTransition(() => deleteCourtAction(fd));
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-red-600 hover:text-red-800 font-medium text-xs disabled:opacity-60 cursor-pointer"
    >
      {isPending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
