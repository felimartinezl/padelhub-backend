import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditForm from "./edit-form";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      rut: true,
      dv_rut: true,
      name: true,
      phone: true,
      zone: true,
      level: true,
      role: true,
      is_active: true,
      mmr: true,
      created_at: true,
    },
  });

  if (!user) notFound();

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Editar usuario</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-2 gap-4 mb-6 pb-4 border-b border-gray-100 text-sm">
          <div>
            <p className="text-gray-500">RUT</p>
            <p className="font-medium text-gray-900">
              {user.rut}-{user.dv_rut}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Teléfono</p>
            <p className="font-medium text-gray-900">{user.phone}</p>
          </div>
          <div>
            <p className="text-gray-500">MMR</p>
            <p className="font-medium text-gray-900">{user.mmr}</p>
          </div>
          <div>
            <p className="text-gray-500">Miembro desde</p>
            <p className="font-medium text-gray-900">
              {new Date(user.created_at).toLocaleDateString("es-CL")}
            </p>
          </div>
        </div>

        <EditForm
          user={{
            id: user.id,
            name: user.name,
            zone: user.zone,
            level: user.level,
            role: user.role,
            is_active: user.is_active,
          }}
        />
      </div>
    </div>
  );
}
