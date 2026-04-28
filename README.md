# AgroTasks

App mobile para que jefes de campo asignen tareas a empleados agrarios y vean
su progreso. Empleados reciben notificaciones, marcan tareas como hechas y
suben fotos como evidencia.

## Stack

- Expo SDK 51 + React Native + TypeScript
- expo-router (file-based routing)
- Supabase (auth, postgres, storage, realtime)
- Zustand para estado global
- expo-notifications, expo-image-picker, expo-camera
- AsyncStorage para persistencia local

## Requisitos

- Node 18+ (recomendado el LTS actual)
- npm
- Para correr en celu: la app **Expo Go** instalada (Android o iOS)
- El celu y la PC tienen que estar en la **misma red WiFi**

## Setup

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el .env a partir del ejemplo y completar credenciales
cp .env.example .env
# editá .env y poné tu EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY
# (sacalos del dashboard de Supabase: Project Settings → API)

# 3. Levantar el dev server
npm start
```

`npm start` abre el dev server de Expo y muestra un QR en la terminal.

## Correr en el celu

1. Abrí la app **Expo Go**.
2. Escaneá el QR (Android: dentro de Expo Go; iOS: con la cámara nativa).
3. La app se baja al toque y refresca cada vez que guardás un archivo.

## Otros comandos

- `npm run android` — abre en emulador Android (si tenés Android Studio)
- `npm run ios` — abre en simulador iOS (solo en macOS)
- `npm run web` — abre la versión web

## Estructura

```
app/             pantallas (expo-router file-based)
  (auth)/        login, register
  (jefe)/        pantallas del rol jefe
  (empleado)/    pantallas del rol empleado
components/      componentes reutilizables
lib/             clientes y stores (supabase.ts, etc.)
hooks/           hooks custom
types/           tipos TypeScript compartidos
docs/            documentación de aprendizaje
supabase/        SQL (schema, policies, migrations)
```

## Documentación

- `CLAUDE.md` — contexto y convenciones del proyecto
- `docs/00-setup.md` — explicación del setup inicial
