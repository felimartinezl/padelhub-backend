import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ==========================================
// POST: AÑADIR O CAMBIAR FOTO DE PERFIL
// ==========================================
export async function POST(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut: id } = await context.params;

    // 1. Verificar que el usuario exista
    let player;
    try {
      player = await prisma.users.findUnique({ where: { id } });
    } catch (e: any) { e._step = "db_find"; throw e; }

    if (!player) {
      return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
    }

    // 2. Extraer el archivo enviado por el Frontend (FormData)
    let formData, file;
    try {
      formData = await request.formData();
      file = formData.get("file") as File;
    } catch (e: any) { e._step = "formdata"; throw e; }

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo de imagen" }, { status: 400 });
    }

    // 3. Convertir el archivo a un Buffer
    let buffer;
    try {
      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);
    } catch (e: any) { e._step = "buffer"; throw e; }

    // 4. SI EL USUARIO YA TENÍA FOTO, BORRAR LA ANTERIOR DE CLOUDINARY
    if (player.photo_url) {
      try {
        const urlParts = player.photo_url.split("/");
        const fileNameWithExtension = urlParts[urlParts.length - 1];
        const publicId = `padelhub_avatars/${fileNameWithExtension.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.log("No se pudo borrar la foto anterior en Cloudinary");
      }
    }

    // 5. Subir la nueva imagen a Cloudinary
    let uploadResponse: any;
    try {
      uploadResponse = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: "padelhub_avatars",
            transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(buffer);
      });
    } catch (e: any) { e._step = "cloudinary_upload"; throw e; }

    const secureUrl = uploadResponse.secure_url;

    // 6. Guardar la URL en la base de datos
    try {
      await prisma.users.update({
        where: { id: player.id },
        data: { photo_url: secureUrl },
      });
    } catch (e: any) { e._step = "db_update"; throw e; }

    return NextResponse.json({
      message: "Foto de perfil actualizada con éxito",
      photo_url: secureUrl
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({
      error: "Error al subir la imagen",
      details: error.message,
      step: error._step ?? "unknown",
    }, { status: 500 });
  }
}

// ==========================================
//  DELETE: ELIMINAR FOTO DE PERFIL
// ==========================================
export async function DELETE(
  request: Request,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    const { rut: id } = await context.params;

    const player = await prisma.users.findUnique({
      where: { id },
    });

    //  Modificado: Valida usando 'photo_url'
    if (!player || !player.photo_url) {
      return NextResponse.json({ error: "El jugador no existe o no tiene foto de perfil" }, { status: 404 });
    }

    // 1. Remover de Cloudinary
    const urlParts = player.photo_url.split("/");
    const fileNameWithExtension = urlParts[urlParts.length - 1];
    const publicId = `padelhub_avatars/${fileNameWithExtension.split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId);

    // 2. Dejar el campo nulo en la Base de Datos
    //  Modificado: Setea 'photo_url' en null
    await prisma.users.update({
      where: { id: player.id },
      data: {
        photo_url: null,
      },
    });

    return NextResponse.json({ message: "Foto de perfil eliminada correctamente" }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: "Error al eliminar la imagen", details: error.message }, { status: 500 });
  }
}
