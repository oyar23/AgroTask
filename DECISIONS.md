# Decisiones del proyecto

Log cronológico de decisiones técnicas que afectan el modelo, la
seguridad o cómo trabajamos. Las decisiones nuevas van arriba.

---

## 2026-05-01 · Fase 7: dashboard del jefe

### Cálculos en cliente, no en server

El conjunto de tareas de un campo cabe en una sola query (cientos en
el MVP). Hacer agregados en JS con un solo recorrido (`calcularDashboard`)
es más simple y permite tipar end-to-end con TypeScript. Una vista
materializada en Postgres no aporta acá: las métricas dependen de
`now()`, así que igualmente se recalcularían en cada query.

Se deja como TODO mover a vista si en algún momento las queries del
dashboard pasan a ser pesadas (5k+ tareas).

### Empleados sin tareas figuran con 0/0

Decisión de UX. Antes de iterar las tareas, inicializamos el map
`porEmpleado` con todos los empleados del campo. Esconderlos sería
peor: el jefe quiere ver justo a los que no tienen carga.

---

## 2026-05-01 · Fase 6: push notifications preparada (no activa)

### Por qué dejarla preparada en vez de activarla

`expo-notifications` no funciona en Expo Go desde SDK 53. Activar el
flujo (importar en `auth-store`, llamar `getExpoPushTokenAsync`)
ensucia los logs con warnings sin ningún beneficio en el flujo
actual de testing. Dejamos `lib/push.ts` listo, el SQL listo, la
Edge Function lista, y comentamos las dos líneas en `auth-store.ts`
con `TODO Fase 6 (push)` para que el usuario las descomente cuando
tenga el dev build.

### Edge Function en lugar de pg_net puro

Podríamos llamar a Expo Push directamente desde el trigger con
`pg_net`. La Edge Function nos da:
- Lugar tipado y testeable para la lógica (levantar tokens, formar
  payload, manejar receipts).
- Posibilidad de iterar sin migraciones SQL.
- Logs visibles vía `supabase functions logs`.

Detalle en `docs/06-notifications.md`.

### Token de Expo Push, no FCM/APNs directos

Expo Push abstrae las dos plataformas. Recibimos un
`ExponentPushToken[...]` y Expo se encarga de FCM/APNs según
plataforma. Para el volumen del MVP es suficiente; ir directo
requeriría credenciales en ambos providers más servidor propio.

### `app.supabase_url` y `app.service_role_key` en variables de DB

El trigger necesita el URL de la API y un key con permisos para
ejecutar la función. Lo guardamos como variables de la base con
`ALTER DATABASE ... SET`. **No** queda en `app.json` ni en logs;
el service role key salta toda RLS y cualquier exposición sería
catastrófica.

---

## 2026-05-01 · Fase 5: storage para fotos

### Bucket privado + signed URLs (TTL 1 hora)

Las fotos no son públicas. Un bucket público devolvería URLs estables
que cualquiera con el link puede ver, sin auth. Si una URL se filtra
(Slack, screenshot, crawler), la foto queda visible para siempre.

Con bucket privado + signed URL:
- La URL incluye un token con expiración corta (1 hora).
- Al expirar deja de funcionar; podemos rotar el JWT secret y todas
  las URLs activas mueren.
- Costo: una llamada extra a `createSignedUrl` cada vez que se
  muestra una foto. Negligible en el MVP.

### Path convention: `{tarea_id}/{foto_id}.jpg`

Las policies de `storage.objects` necesitan resolver permisos sin
poder consultar `fotos` (la fila puede aún no existir cuando se
sube). El primer segmento del path es el `tarea_id`, que las
policies extraen con `split_part(name, '/', 1)::uuid`. Vínculo
fuerte entre path y `tareas`, sin dependencia entre las dos tablas.

El `foto_id` lo genera el cliente con `crypto.randomUUID` antes del
upload, así la fila y el archivo apuntan al mismo recurso. El
INSERT en `fotos` usa el mismo id; si falla, intentamos limpiar el
archivo huérfano (best-effort).

### Compresión a 1024px / JPEG 0.7

Una foto de cámara moderna pesa 4-12 MB. La pantalla del jefe
muestra a 600px máximo. Subir 12 MB es lento, costoso para el plan
de datos del trabajador, e inútil. Comprimimos con
`expo-image-manipulator` antes de subir; resultado típico ~200 KB.

### Sin modo offline

Si no hay internet, `subirFoto` falla con mensaje. Una cola
persistente de uploads queda para v2. CLAUDE.md señala el contexto
("manos sucias, sol fuerte") que justifica robustez visual, pero
no se justifica complejidad de offline en el MVP.

### `as unknown as T` para casts del cast embebido de Supabase

Cuando Supabase hace un join 1:N (ej. `empleado:profiles!fk(nombre)`),
el TS inference siempre lo tipa como array, aunque la FK sea
many-to-one. PostgREST en runtime devuelve un objeto. El cast vía
`unknown` lo reforma con un comentario explicando por qué. Más
limpio que `as any`.

---

## 2026-05-01 · Fase 4: vista del empleado

### Read-only en cliente, enforce real en trigger

La pantalla del empleado es read-only excepto para `estado`. Eso es
UX; la **autoridad** vive en `restringir_update_empleado_solo_estado`,
el trigger en `schema.sql`. Si el cliente intentara cambiar otra
columna, Postgres lo bloquearía.

Esto refuerza la regla de CLAUDE.md ("la app no debe tener lógica
de autorización propia"): el cliente es libre de mostrar lo que
quiera; la base define qué se puede hacer.

### El empleado no ve "cancelada" como acción

Cancelar una tarea es decisión del jefe. No exponemos la opción al
empleado. Si quisiera "rechazar" formalmente la tarea, eso sería
una transición distinta a modelar (out of scope MVP).

---

## 2026-05-01 · Fase 3: CRUD de tareas (jefe)

### `typedRoutes` desactivado

`experiments.typedRoutes: true` en `app.json` generaba `.expo/types/router.d.ts`
con un union de paths permitidos. Dos problemas:
- Los paths dinámicos (`/(jefe)/tareas/[id]`) se vuelven friction
  ("no es asignable a `RelativePathString | ...`") porque el cliente
  los construye como template literal.
- El archivo generado tiene fechas: si lo regenerás cada vez que
  cambian los archivos del proyecto, el TS de los archivos nuevos
  falla hasta que el siguiente arranque del dev server lo regenere.

Decisión: desactivar el experimento. Confiamos en el linter y en el
testing manual. Si alguna ruta se rompe en runtime, el log lo dice.

### Hooks de fetch con patrón uniforme

Tres hooks (`use-mi-campo`, `use-empleados`, `use-tareas`) siguen el
mismo patrón: `cargar` con `useCallback`, `useEffect` para disparar
al montar, y `refresh` exportado al componente. No usamos React Query
/ SWR para mantener el bundle chico. La alternativa simple alcanza
para el MVP.

### Mutaciones como funciones puras, no como métodos del store

`crearTarea`, `actualizarTarea`, `eliminarTarea` viven en
`hooks/use-tareas.ts` como funciones puras que devuelven
`{ ok, error }`. La UI decide qué hacer (navegar, mostrar error,
refrescar). Esto las hace fácil de probar sin levantar React.

Solo auth quedó en Zustand porque el estado de sesión necesita ser
compartido entre layout y todas las pantallas.

### "Crear campo" embebido en el home del jefe

El registro como jefe no pide datos del campo (igual al de
empleado, que sí pide código). El primer arranque del jefe detecta
que `useMiCampo() === null` y le muestra un mini-form para crearlo.
El campo se identifica con un `codigo` único de 4-12 chars que el
jefe comparte con sus empleados.

---

## 2026-04-29 · Upgrade a Expo SDK 54

### Motivo

El Expo Go del usuario es SDK 54 y no abre el bundle del proyecto en
SDK 51. Antes que pedirle que mantenga dos versiones de Expo Go (no
es trivial), hicimos el salto.

### Versiones que cambiaron

- `expo` 51 → 54
- `react` 18.2 → 19.1
- `react-native` 0.74 → 0.81
- `expo-router` 3.5 → 6.0
- `react-native-reanimated` 3.10 → 4.x (requiere New Architecture, ya
  activa por default desde SDK 53)
- `react-native-safe-area-context`, `react-native-screens`,
  `expo-camera`, `expo-image-picker`, `expo-notifications`,
  `expo-splash-screen`, `expo-system-ui`, `expo-web-browser`,
  `expo-status-bar`, `expo-linking`, `expo-font`, `@expo/vector-icons`:
  bumps acordes a SDK 54
- `@types/react`, `jest-expo`, `react-test-renderer`, `typescript`:
  bumpeados para matchear React 19

### Paquetes removidos

- `@react-native-async-storage/async-storage` se mantiene, pero:
- `@react-navigation/native` se sacó: con expo-router v6 ya no es peer
  directo y solo agregaba peso al bundle.

### Procedimiento

`npx expo install expo@^54.0.0`, `npx expo install --fix`, edición a
mano de devDependencies (no las toca expo install), `rm -rf node_modules
package-lock.json .expo` + `npm install` para destrabar conflictos de
peer deps (npm no resolvía expo-router v6 con node_modules todavía
ocupado por v3).

### Limitación aceptada: persistencia de sesión en web SSR

El bundler web de Expo (`web.output: "static"`) hace pre-render estático
sin DOM. AsyncStorage importa código que toca `window` al evaluarse, así
que el bundle crasheaba con `ReferenceError: window is not defined`.

Solución: en `lib/supabase.ts`, `storage` se pasa a `createClient` solo
si existe `window`. En SSR (build estático), `persistSession` y
`autoRefreshToken` también quedan en `false`.

Consecuencia: en la versión web pre-renderizada, la sesión NO persiste
entre arranques. El user que abre la app en web tiene que loguearse
cada vez. **La app objetivo es mobile** (CLAUDE.md, `Qué es`); web es
bonus. Si en algún momento queremos persistencia en web, pasamos a
`web.output: "single"` (sin SSR) o usamos un storage custom.

---

## 2026-04-28 · Fase 2: arquitectura de auth

### Email confirmation desactivado en MVP

En el dashboard de Supabase (Authentication → Providers → Email) está
desactivado el "Confirm email". Razones:

- El MVP no tiene proveedor de email configurado (SMTP/Resend/etc).
  Activarlo bloquearía el signUp porque no hay forma de entregar el
  link de confirmación.
- Mantiene el flujo simple: `auth.signUp()` devuelve `session` activa
  inmediatamente, lo que nos permite hacer el INSERT en `profiles`
  acto seguido (la policy `profiles_insert` exige `id = auth.uid()`,
  así que sin sesión activa el INSERT fallaría).

**En producción se reactiva** una vez que haya proveedor de email.
Cuando se reactive, la app va a tener que cambiar el flujo: el signUp
no devolverá session, la app debe mostrar "revisá tu casilla" y el
INSERT del profile se puede mover a un trigger en `auth.users` (lo
listamos como TODO en `docs/01-schema-y-rls.md` y en `docs/02-auth.md`).

### RPC `buscar_campo_por_codigo` para validar código antes del signup

Las policies de `campos` exigen pertenencia o autoridad
(`current_user_campo_id() OR jefe_id = auth.uid()`). Un anon o un user
recién creado sin profile no cumple ninguna, por lo que un `SELECT id
FROM campos WHERE codigo = X` siempre devuelve 0 filas y el cliente no
puede distinguir "código mal escrito" de "policy bloqueante".

Solución: función `SECURITY DEFINER` que devuelve solo el `uuid` del
campo si existe, expuesta a `anon` y `authenticated`. La definición vive
en `supabase/policies.sql` con la justificación completa.

### Decisión arquitectural: redirección por rol en el layout raíz

La redirección a `/(jefe)` o `/(empleado)` se decide en `app/_layout.tsx`
en función del `profile.rol` cargado en el store, no en cada pantalla.

Razones:
- Centraliza el control de acceso del lado cliente. Aun así, la
  autorización real vive en RLS (CLAUDE.md), así que esta capa solo
  evita renderizar pantallas ajenas; no es un control de seguridad.
- Las pantallas no necesitan saber si están "autorizadas" para
  mostrarse; si están montadas, ya pasaron el filtro.
- Cambiar de rol (poco común) o cerrar sesión disparan un único
  re-render en el layout y una redirección, en vez de N pantallas
  chequeando independientemente.

### Caso "huérfano": session sin profile

Si la app muere entre `auth.signUp()` y el `INSERT` en `profiles`, el
user queda con auth válido pero sin profile. Manejo:

- En el flujo de signUp, si el INSERT falla, hacemos `signOut()`
  inmediatamente.
- En `loadSession`/`signIn`, si la sesión existe pero el SELECT del
  profile devuelve 0 filas, hacemos `signOut()` y mostramos un mensaje
  pidiendo registrarse de nuevo.

El user en `auth.users` queda; la limpieza es tarea administrativa.
Documentado como TODO en `docs/02-auth.md`: a futuro, un trigger en
`auth.users` que cree un profile mínimo automáticamente eliminaría el
problema de raíz.

---

## 2026-04-28 · Policy `profiles_select` expandida para cubrir el caso jefe→empleado

La versión original de la policy solo permitía ver profiles del mismo
campo via `profiles.campo_id = current_user_campo_id()`. Eso no
contemplaba el caso de un jefe con `profile.campo_id = NULL` (estado
normal cuando recién creó el campo y no se autoasignó), que no podía
ver a sus empleados.

Se agregó una tercera cláusula:

```sql
OR campo_id IN (SELECT id FROM campos WHERE jefe_id = auth.uid())
```

que matchea por la relación de **autoridad** (`campos.jefe_id`) en
lugar de **pertenencia** (`profiles.campo_id`).

Detalle completo y caso de estudio en `docs/01-schema-y-rls.md`,
sección "Caso de estudio: el jefe ciego".
