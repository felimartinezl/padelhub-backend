"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function annulResultAction(formData: FormData) {
  const matchId = formData.get("match_id") as string;
  if (!matchId) return { error: "ID de partido inválido" };

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.match_results.findUnique({
        where: { match_id: matchId },
        select: { confirmed: true },
      });

      if (!result) throw new Error("Este partido no tiene resultado registrado");

      if (result.confirmed) {
        const history = await tx.mmr_history.findMany({
          where: { match_id: matchId },
          select: { user_id: true, mmr_before: true },
        });

        await Promise.all(
          history.map((entry) =>
            tx.users.update({
              where: { id: entry.user_id },
              data: { mmr: entry.mmr_before, updated_at: new Date() },
            })
          )
        );

        await tx.mmr_history.deleteMany({ where: { match_id: matchId } });
        await tx.matches.update({
          where: { id: matchId },
          data: { status: "confirmed", updated_at: new Date() },
        });
      }

      await tx.match_results.delete({ where: { match_id: matchId } });
    });

    revalidatePath(`/admin/matches/${matchId}`);
    revalidatePath("/admin/matches");
    return { success: true };
  } catch (error: any) {
    return { error: error.message || "Error al anular el resultado" };
  }
}
