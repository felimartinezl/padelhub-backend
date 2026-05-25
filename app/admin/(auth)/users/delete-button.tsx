"use client";
import { useTransition } from "react";
import { deleteUserAction } from "./actions";

export default function DeleteButton({ userId, userName }: { userId: string; userName: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`¿Eliminar a ${userName}? Esta acción no se puede deshacer.`)) return;
    const formData = new FormData();
    formData.set("user_id", userId);
    startTransition(() => deleteUserAction(formData));
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-red-500 hover:text-red-700 font-medium text-xs disabled:opacity-40 cursor-pointer"
    >
      {isPending ? "..." : "Eliminar"}
    </button>
  );
}
