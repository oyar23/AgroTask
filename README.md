# AgroTasks

App mobile para que jefes de campo asignen tareas a empleados agrarios y vean
su progreso. Empleados reciben notificaciones, marcan tareas como hechas y
suben fotos como evidencia.

## Stack

- Expo SDK 54 + React 19 + React Native 0.81 + TypeScript
- expo-router v6 (file-based routing)
- Supabase (auth, postgres, storage, edge functions)
- Zustand para estado global
- Zod para validación de formularios
- AsyncStorage para persistencia local

## Estado de las fases

- ✅ **Fase 1** — schema, RLS, triggers
- ✅ **Fase 2** — auth (login, registro, sesión persistida, redirect por rol)
- ✅ **Fase 3** — CRUD de tareas (jefe)
- ✅ **Fase 4** — vista del empleado
- ✅ **Fase 5** — fotos con storage (subida y visualización)
- 🟡 **Fase 6** — push notifications (preparado, requiere dev build para activar)
- ✅ **Fase 7** — dashboard del jefe

## Requisitos

- Node 18+ (LTS actual)
- npm
- Para celu: app **Expo Go** instalada (Android/iOS) — celu y PC en la misma WiFi
- Para push notifications: development build de EAS (no funcionan en Expo Go
  desde SDK 53). Ver `docs/06-notifications.md`.

## Setup

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el .env a partir del ejemplo
cp .env.example .env
# Completar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY
# (Supabase dashboard → Project Settings → API)

# 3. Aplicar SQL pendiente (ver siguiente sección)

# 4. Levantar el dev server
npm start
```

`npm start` abre el dev server y muestra un QR. Escanealo desde Expo Go.

## SQL a aplicar (en orden)

Todo en el SQL Editor de Supabase. **Aplicar una sola vez por proyecto**.

1. `supabase/schema.sql` — tablas, triggers, índices.
2. `supabase/policies.sql` — RLS, helpers, RPC `buscar_campo_por_codigo`.
3. `supabase/policies-storage.sql` — RLS sobre `storage.objects`.
   - Antes de aplicar, crear un bucket llamado **`fotos`** en Storage
     (privado, no marcar "public bucket").
4. `supabase/schema-push.sql` — solo si vas a activar push notifications.
   Requiere también:
   - Habilitar la extensión `pg_net` (Database → Extensions).
   - Setear `app.supabase_url` y `app.service_role_key` con `ALTER DATABASE`.
   - Desplegar la Edge Function (`supabase functions deploy notify-tarea`).
   - Detalles completos: `docs/06-notifications.md`.

## Otros comandos

- `npm run android` — emulador Android
- `npm run ios` — simulador iOS (solo macOS)
- `npm run web` — versión web (sin persistencia de sesión, ver
  `DECISIONS.md`)
- `npx tsc --noEmit` — chequeo de tipos sin generar JS

## Estructura

```
app/             pantallas (expo-router file-based)
  (auth)/        login, register
  (jefe)/        dashboard, tareas (lista, crear, detalle)
  (empleado)/    lista de mis tareas, detalle
components/      componentes reutilizables (Button, Chip, Dropdown, etc.)
hooks/           use-tareas, use-empleados, use-mi-campo, use-fotos, use-dashboard
lib/             supabase, auth-store, storage, push, auth-helpers, platform-utils
types/           tipos TS compartidos (database.ts, auth.ts, tareas.ts)
docs/            documentación didáctica de cada fase
supabase/        SQL, edge functions
```

## Documentación

- `CLAUDE.md` — contexto y convenciones del proyecto
- `DECISIONS.md` — log cronológico de decisiones técnicas
- `docs/00-setup.md` — explicación del setup inicial
- `docs/01-schema-y-rls.md` — modelo de datos y RLS
- `docs/02-auth.md` — flujo de auth completo
- `docs/03-crud-tareas.md` — CRUD del jefe
- `docs/04-vista-empleado.md` — vista del empleado
- `docs/05-fotos.md` — subida y visualización de fotos
- `docs/06-notifications.md` — push notifications (cómo activarlas)
- `docs/07-dashboard.md` — dashboard del jefe

## Pendientes para producción

Cosas que dejamos a propósito para después del MVP:

- **Email confirmation activado** + flujo de "revisá tu casilla". Hoy el
  signUp devuelve sesión inmediata porque no hay proveedor SMTP. Cuando
  haya: reactivar en el dashboard de Supabase y mover el INSERT del
  profile a un trigger en `auth.users`.
- **Recuperación de contraseña.** Necesita email configurado.
- **Push notifications activas.** Requiere dev build (ver
  `docs/06-notifications.md`).
- **Realtime para refrescar listas en vivo.** Hoy refrescamos al volver y
  con pull-to-refresh.
- **Modo offline para fotos.** Hoy si no hay internet, falla con mensaje.
  Una cola persistente de uploads pendientes está fuera del MVP.
- **`expo-secure-store` para refresh token.** AsyncStorage lo guarda en
  texto plano; cualquiera con acceso al device puede leerlo.
- **Gráficos en el dashboard.** Cards y barras alcanzan en MVP.
- **Notificación al jefe cuando un empleado completa.** Hoy solo
  notificamos al INSERT.
- **Limpieza de tokens push inválidos.** La Edge Function actual no
  procesa los receipts de Expo Push.
- **Trigger en `auth.users` que cree profile mínimo.** Eliminaría el
  estado "huérfano" de raíz.
- **Bulk operations** sobre tareas (eliminar/asignar varias).
- **Búsqueda full-text** sobre título/descripción de tareas.
