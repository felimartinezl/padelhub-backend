import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST: AÑADIR O CAMBIAR FOTO DE PERFIL
// Acepta JSON: { "image": "data:image/jpeg;base64,..." }
export async function POST(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut: id } = await context.params;

    const player = await prisma.users.findUnique({ where: { id } });
    if (!player) {
      return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const { image } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Se requiere el campo 'image' con la imagen en base64" }, { status: 400 });
    }

    // Borrar foto anterior de Cloudinary si existe
    if (player.photo_url) {
      try {
        const urlParts = player.photo_url.split("/");
        const fileNameWithExtension = urlParts[urlParts.length - 1];
        const publicId = `padelhub_avatars/${fileNameWithExtension.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch {
        // ignorar si falla — no bloquea el upload nuevo
      }
    }

    // Cloudinary acepta data URLs directamente
    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: "padelhub_avatars",
      transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });

    await prisma.users.update({
      where: { id: player.id },
      data: { photo_url: uploadResponse.secure_url },
    });

    return NextResponse.json({
      message: "Foto de perfil actualizada con éxito",
      photo_url: uploadResponse.secure_url,
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al subir la imagen", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: ELIMINAR FOTO DE PERFIL
export async function DELETE(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut: id } = await context.params;

    const player = await prisma.users.findUnique({ where: { id } });

    if (!player || !player.photo_url) {
      return NextResponse.json({ error: "El jugador no existe o no tiene foto de perfil" }, { status: 404 });
    }

    const urlParts = player.photo_url.split("/");
    const fileNameWithExtension = urlParts[urlParts.length - 1];
    const publicId = `padelhub_avatars/${fileNameWithExtension.split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId);

    await prisma.users.update({
      where: { id: player.id },
      data: { photo_url: null },
    });

    return NextResponse.json({ message: "Foto de perfil eliminada correctamente" }, { status: 200 });

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
