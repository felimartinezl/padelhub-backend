# PadelHub — Backend

API REST y panel de administración para la plataforma PadelHub, una aplicación móvil que permite a jugadores de pádel organizar partidos, gestionar resultados y seguir su progreso competitivo mediante un sistema de MMR (Matchmaking Rating).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript |
| ORM | Prisma 5 |
| Base de datos | PostgreSQL (Supabase) |
| Autenticación | JWT (access token + refresh token) |
| Almacenamiento de imágenes | Cloudinary |
| Push notifications | Expo Push Notifications |
| SMS / OTP | Twilio |
| Deploy | Vercel |
| Testing | Jest, Supertest, Playwright, Artillery |

---

## Módulos principales

### Autenticación
- Login con RUT y contraseña
- Refresh token con rotación
- Recuperación de contraseña vía OTP (SMS con Twilio)
- Logout con invalidación del refresh token

### Usuarios
- Registro, edición y búsqueda por RUT
- Foto de perfil (upload a Cloudinary)
- Historial de MMR
- Sugerencia de rivales por nivel y zona
- Preferencias de notificaciones (por tipo, opt-in por defecto)

### Partidos
- Crear, listar y filtrar partidos (zona, club, estado)
- Unirse a un partido con validación de nivel y cupo
- Sistema de invitaciones con notificación push
- Inicio de partido con ventana de ±15 minutos respecto a la hora pactada
- Cancelación por el organizador (partidos confirmados: solo si pasó 1 hora sin iniciar)
- Chat interno por partido
- Confirmación de presencia vía código QR

### Resultados y MMR
- Registro de resultado por cualquier jugador participante
- Confirmación del resultado por un jugador del equipo contrario
- Cálculo automático de delta MMR al confirmar
- Anulación de resultado con reversión atómica del MMR (solo admin)

### Valoraciones post-partido
- Sistema de estrellas del 1 al 5 entre jugadores del mismo partido
- Promedio de valoraciones visible en el perfil del usuario
- Distribución de estrellas y valoraciones recientes

### Notificaciones
- Centro de notificaciones persistente (historial completo)
- Contador de no leídas
- Marcar como leída (individual o todas)
- Envío de push condicional según preferencias del usuario
- Limpieza automática de tokens de dispositivo inválidos

### Leaderboard
- Ranking global de jugadores por MMR

### Panel de administración (`/admin`)
- Login independiente con sesión en cookie
- Gestión de usuarios: listado, edición, suspensión temporal
- Gestión de canchas: CRUD completo con horarios por día
- Gestión de partidos: listado con filtros, detalle, anulación de resultado

---

## Endpoints de la API

```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/verify-otp
POST   /api/auth/reset-password

GET    /api/users
POST   /api/users
GET    /api/users/:rut
PATCH  /api/users/:rut
POST   /api/users/:rut/profile/photo
DELETE /api/users/:rut/profile/photo
GET    /api/users/:rut/profile
GET    /api/users/:rut/mmr-history
GET    /api/users/:rut/suggest-rivals
POST   /api/users/:rut/device-token
GET    /api/users/:rut/invitations
GET    /api/users/:rut/ratings
GET    /api/users/:rut/notifications
PATCH  /api/users/:rut/notifications          (marcar todas como leídas)
GET    /api/users/:rut/notifications/unread-count
PATCH  /api/users/:rut/notifications/:id      (marcar una como leída)
GET    /api/users/:rut/notification-preferences
PATCH  /api/users/:rut/notification-preferences

GET    /api/matches
POST   /api/matches
GET    /api/matches/:id
DELETE /api/matches/:id
POST   /api/matches/:id/join
POST   /api/matches/:id/start
POST   /api/matches/:id/invite
GET    /api/matches/:id/invitations
PATCH  /api/invitations/:id
GET    /api/matches/:id/qr
POST   /api/matches/:id/confirm-presence
POST   /api/matches/:id/result
POST   /api/matches/:id/result/confirm
GET    /api/matches/:id/chat
POST   /api/matches/:id/chat
GET    /api/matches/:id/ratings
POST   /api/matches/:id/ratings

GET    /api/leaderboard

GET    /api/health
```

---

## Variables de entorno

Creá un archivo `.env` en la raíz con las siguientes variables:

```env
# Base de datos
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"

# JWT
JWT_SECRET="tu_secret_aqui"

# Cloudinary
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# Twilio (OTP)
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="+1..."

# Admin panel
ADMIN_PASSWORD="..."
ADMIN_JWT_SECRET="..."

# URL del sitio (para Vercel)
NEXT_PUBLIC_BASE_URL="https://tu-proyecto.vercel.app"
```

---

## Correr localmente

```bash
# 1. Instalar dependencias
npm install

# 2. Generar cliente de Prisma
npx prisma generate

# 3. Iniciar servidor de desarrollo
npm run dev
```

El servidor queda disponible en `http://localhost:3000`.

La documentación Swagger está en `http://localhost:3000/api-docs`.

---

## Migraciones de base de datos

Las migraciones **no se ejecutan automáticamente** en Vercel (el firewall de Supabase bloquea el puerto 5432 desde los servidores de Vercel).

Para aplicar una migración nueva:

1. Crear el archivo SQL en `prisma/migrations/`
2. Ejecutarlo manualmente en **Supabase Dashboard → SQL Editor**
3. Actualizar `prisma/schema.prisma`
4. Hacer push a `main` — Vercel ejecuta `prisma generate` automáticamente en el `postinstall`

---

## Tests

```bash
# Tests unitarios e integración
npm test

# Tests en modo CI (sin watch)
npm run test:ci

# Tests end-to-end (Playwright)
npm run test:e2e

# Tests de carga (Artillery)
npm run test:load
```

---

## Deploy

El proyecto se despliega automáticamente en Vercel al hacer push a `main`.

**URL de producción:** `https://padelhub-backend-phi.vercel.app`
