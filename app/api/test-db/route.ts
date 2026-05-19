// conexion de prueba inicial a la base de datos // no se utiliza, no sirve para nada.
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    
    const count = await prisma.match_players.count();
    return NextResponse.json({ 
      status: "Conectado correctamente", 
      total_players: count 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      status: "Error de conexión", 
      error: error.message 
    }, { status: 500 });
  }
}