import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-middleware";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function findUser(rut: string) {
  const num = parseInt(rut);
  if (isNaN(num)) return null;
  return prisma.users.findFirst({ where: { rut: num } });
}

// POST /api/users/{rut}/profile/photo
// Content-Type: multipart/form-data  —  campo: "photo"
export async function POST(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { errorResponse } = requireAuth(request);
    if (errorResponse) return errorResponse;

    const { rut } = await context.params;
    const player = await findUser(rut);

    if (!player) {
      return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se recibió archivo. Enviá el campo 'photo' como multipart/form-data" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Borrar foto anterior de Cloudinary (best-effort)
    if (player.photo_url) {
      try {
        const parts = player.photo_url.split("/");
        const filename = parts[parts.length - 1];
        const publicId = `padelhub_avatars/${filename.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch {
        // ignorar
      }
    }

    const uploadResponse: any = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "padelhub_avatars",
            transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });

    const photo_url: string = uploadResponse.secure_url;

    await prisma.users.update({
      where: { id: player.id },
      data: { photo_url, updated_at: new Date() },
    });

    return NextResponse.json({ photo_url }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al subir la imagen", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/users/{rut}/profile/photo
export async function DELETE(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { errorResponse } = requireAuth(request);
    if (errorResponse) return errorResponse;

    const { rut } = await context.params;
    const player = await findUser(rut);

    if (!player || !player.photo_url) {
      return NextResponse.json(
        { error: "El jugador no existe o no tiene foto de perfil" },
        { status: 404 }
      );
    }

    const parts = player.photo_url.split("/");
    const filename = parts[parts.length - 1];
    const publicId = `padelhub_avatars/${filename.split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId);

    await prisma.users.update({
      where: { id: player.id },
      data: { photo_url: null, updated_at: new Date() },
    });

    return NextResponse.json({ message: "Foto de perfil eliminada correctamente" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al eliminar la imagen", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
