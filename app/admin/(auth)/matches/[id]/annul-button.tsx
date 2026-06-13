"use client";

import { useRef, useState } from "react";
import { annulResultAction } from "./actions";

export default function AnnulButton({
  matchId,
  isConfirmed,
}: {
  matchId: string;
  isConfirmed: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const label = isConfirmed
    ? "Anular resultado y revertir MMR"
    : "Eliminar resultado pendiente";

  const confirmMsg = isConfirmed
    ? "¿Anular el resultado? Se revertirán los cambios de MMR de todos los jugadores y el partido volverá a estado Confirmado."
    : "¿Eliminar el resultado pendiente? Los jugadores podrán registrar uno nuevo.";

  async function handleClick() {
    if (!confirm(confirmMsg)) return;
    setPending(true);
    setError(null);
    const fd = new FormData(formRef.current!);
    const res = await annulResultAction(fd);
    if (res?.error) {
      setError(res.error);
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <form ref={formRef}>
        <input type="hidden" name="match_id" value={matchId} />
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {pending ? "Anulando..." : label}
        </button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
