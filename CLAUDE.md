# AgroTasks - Contexto del Proyecto

## Qué es
App mobile para que jefes de campo asignen tareas a empleados 
agrarios y vean su progreso. Empleados reciben notificaciones, 
marcan tareas como hechas y suben fotos como evidencia.

## Stack
- Expo SDK 54 + React 19 + React Native 0.81 + TypeScript
- expo-router v6 (file-based routing)
- Supabase: auth, postgres, storage, realtime
- Zustand para estado global
- Zod para validación de schemas (solo en formularios; para validaciones
  internas chicas usar funciones simples)
- expo-notifications, expo-image-picker, expo-camera
- AsyncStorage para persistencia local (mobile y web client; en build
  estático web la persistencia queda desactivada por el guard de SSR)

## Estructura de carpetas
/app          → pantallas (expo-router)
  /(auth)     → login, register
  /(jefe)     → pantallas del rol jefe
  /(empleado) → pantallas del rol empleado
/components   → componentes reutilizables
/lib          → clientes (supabase.ts, auth store, etc)
/hooks        → hooks custom
/types        → tipos TypeScript compartidos
/docs         → documentación de aprendizaje
/supabase     → SQL (schema, policies, migrations)

## Modelo de datos
[acá pegás tu schema una vez que lo tengas, en SQL o como diagrama]

## Convenciones
- Todo el texto de UI en español rioplatense.
- Botones grandes (mínimo 56px de alto), alta legibilidad. 
  La app se usa con sol fuerte y manos sucias.
- Nombres de archivos en kebab-case, componentes en PascalCase.
- No usar `any` en TypeScript salvo último recurso justificado.
- Imports absolutos con alias @/ apuntando a la raíz.

## Decisiones tomadas
- Zustand en lugar de Redux: menos boilerplate, suficiente para 
  el scope del MVP.
- expo-router en vez de react-navigation: viene integrado, file-based, 
  más simple para empezar.
- Supabase RLS para todos los permisos. La app NO debe tener 
  lógica de autorización propia, solo confiar en lo que la base devuelve.
- Fotos comprimidas a 1024px máximo antes de subir, para ahorrar 
  storage y datos móviles.

## Cómo trabajamos
- Una feature por sesión. Al iniciar, leé este archivo, 
  DECISIONS.md y los archivos relevantes a la feature.
- Antes de codear, proponé un plan paso a paso y esperá aprobación.
- Después de cada feature, documentar en /docs/NN-feature.md 
  con explicaciones para alguien que está aprendiendo.
- Comentarios solo en partes no obvias del código.
- Commits descriptivos al terminar cada feature.

## Cosas que el usuario maneja a mano (no tocar sin pedir)
- /supabase/schema.sql (el modelo de datos lo hace el usuario)
- /supabase/policies.sql (las RLS las hace el usuario)
- Configuración de despliegue (EAS, certificados)

## Convenciones que aparecieron durante la implementación

- **Hooks con patrón loading/error/refresh.** Cada hook que trae datos
  expone `{ data, loading, error, refresh }`. `cargar` se memoiza con
  `useCallback`, se dispara con `useEffect`, y `refresh` se devuelve para
  pull-to-refresh y para invalidar después de mutaciones. No usamos
  React Query / SWR (mantenemos bundle chico).
- **Mutaciones como funciones puras, no como métodos del store.** Las
  mutaciones (`crearTarea`, `subirFoto`, etc.) viven en `lib/` o `hooks/`
  y devuelven `{ ok: true, ... } | { ok: false, error: string }`. La UI
  decide cómo reaccionar. Solo auth vive en Zustand.
- **Mensajes de error mapeados a español en el cliente.** Nunca mostrar
  el mensaje crudo de Supabase/Postgres. Cada módulo tiene su
  `mapXErrror()` (ver `auth-helpers.ts`, `use-tareas.ts`, `storage.ts`).
- **Imports absolutos con `@/`.** Configurado en `tsconfig.json`,
  `babel.config.js`. Evita `../../../`.
- **Sin `as any`, sin `// @ts-ignore`.** Si Supabase infiere mal un join,
  hacemos `as unknown as T` con un comentario explicando por qué.
- **`useFocusEffect` para refrescar al volver a una pantalla.** En
  navegaciones push/pop con expo-router, el `useEffect([])` solo corre al
  primer mount. Para refrescar al volver, usamos `useFocusEffect`.
- **Formularios: Zod para validación, mensaje en español.** Schema en
  `types/`, parsing con `safeParse`, distribución de errores por campo.
- **`typedRoutes` desactivado.** Se desactivó el experimental
  `experiments.typedRoutes` de expo-router por fricción con paths
  dinámicos y stale `.expo/types`. Dejamos las strings absolutas y
  confiamos en testing manual.
- **Todo el SQL nuevo va en archivos separados** (`schema-push.sql`,
  `policies-storage.sql`) para que el usuario los aplique en orden sin
  tener que tocar `schema.sql`/`policies.sql` originales.
- **Edge Functions excluidas del tsconfig** (`supabase/edge-functions`)
  porque corren en Deno, no en el bundle de la app, y usan APIs propias.