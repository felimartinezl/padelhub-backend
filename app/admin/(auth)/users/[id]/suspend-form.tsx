"use client";
import { useActionState } from "react";
import { suspendUserAction, liftSuspensionAction } from "../actions";

type Props = {
  userId: string;
  isActive: boolean;
  suspendedUntil: Date | null;
};

export default function SuspendForm({ userId, isActive, suspendedUntil }: Props) {
  const [state, action, isPending] = useActionState(suspendUserAction, null);

  const isSuspended = !isActive && suspendedUntil !== null;

  return (
    <div className="border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Suspensión temporal</h2>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isSuspended
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {isSuspended ? "Suspendido" : "Activo"}
        </span>
      </div>

      {isSuspended && suspendedUntil && (
        <p className="text-sm text-gray-600">
          Suspendido hasta el{" "}
          <span className="font-medium text-gray-900">
            {new Date(suspendedUntil).toLocaleDateString("es-CL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </p>
      )}

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">
          {state.success}
        </div>
      )}

      {isSuspended ? (
        <form action={liftSuspensionAction}>
          <input type="hidden" name="user_id" value={userId} />
          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            Levantar suspensión
          </button>
        </form>
      ) : (
        <form action={action} className="flex gap-2">
          <input type="hidden" name="user_id" value={userId} />
          <input
            name="days"
            type="number"
            min={1}
            max={365}
            defaultValue={7}
            required
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <span className="self-center text-sm text-gray-600">días</span>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {isPending ? "Suspendiendo..." : "Suspender"}
          </button>
        </form>
      )}
    </div>
  );
}
