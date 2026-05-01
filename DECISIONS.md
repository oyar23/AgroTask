# Decisiones del proyecto

Log cronológico de decisiones técnicas que afectan el modelo, la
seguridad o cómo trabajamos. Las decisiones nuevas van arriba.

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
