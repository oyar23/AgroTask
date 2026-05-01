# 02 · Autenticación

Esta es la primera capa de la app que se conecta con Supabase. Login,
registro, manejo de sesión, redirección por rol.

Si no leíste `docs/01-schema-y-rls.md`, leelo primero. Buena parte del
diseño de auth depende de las policies y las funciones helper que viven
en la base.

## ¿Qué es un JWT y cómo lo usa Supabase?

Un **JWT** (JSON Web Token) es una cadena de tres partes separadas por
puntos: `xxx.yyy.zzz`. Las primeras dos son JSON en base64 (header y
payload, legibles por cualquiera), la tercera es una firma criptográfica.

Cuando un usuario se loguea contra Supabase Auth, la base le devuelve
un JWT cuyo payload contiene, entre otras cosas:

- `sub`: el UUID del usuario en `auth.users`. Es lo que devuelve
  `auth.uid()` dentro de Postgres.
- `role`: en Supabase, casi siempre `authenticated`. (Hay también
  `anon` y `service_role`).
- `exp`: timestamp de expiración. Por defecto, 1 hora.

La firma la genera Supabase con una clave secreta. Cualquiera puede
**leer** el payload (no es secreto), pero **nadie puede falsificarlo**
sin la clave: si cambiás el `sub`, la firma deja de matchear y la
base rechaza el token.

Para cada query que la app hace, el cliente Supabase manda el JWT en
el header `Authorization: Bearer <token>`. Postgres lo decodifica,
setea `request.jwt.claims` con el contenido, y las policies de RLS
leen `auth.uid()` ahí.

Esto es importante: **el cliente no envía un user id "a mano"**. Lo
envía el JWT firmado. Si pasamos un `user_id` en el body de un INSERT
y no matchea con `auth.uid()`, la policy lo rechaza. La identidad
viaja en el token, no en los datos.

## El flujo completo de signup, paso a paso

Lo escribimos pensando en un empleado, que es el caso más complejo.
El de jefe es el mismo sin el paso 1.

### Paso 0 · Validación local

Antes de pegarle a la red, validamos el form con Zod:

- nombre ≥ 2 caracteres,
- email con formato válido,
- password ≥ 6,
- passwords coinciden,
- si rol = empleado, código del campo presente.

Esto vive en `types/auth.ts`. Si falla, mostramos errores por campo
y no llamamos a Supabase.

### Paso 1 · Validar el código del campo

```ts
const { data: campoId } = await supabase.rpc(
  'buscar_campo_por_codigo',
  { p_codigo: codigo },
);
```

Llamamos a una RPC en Postgres definida así:

```sql
CREATE FUNCTION public.buscar_campo_por_codigo(p_codigo text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT id FROM campos WHERE codigo = p_codigo $$;
```

¿Por qué una RPC y no un `SELECT * FROM campos WHERE codigo = ...`?

Las policies de `campos` requieren que el caller sea miembro del campo
o su jefe. Un user que recién se está por registrar no es ninguno de
los dos: o es anon, o tiene auth pero no tiene profile aún. En ambos
casos un SELECT directo devuelve 0 filas, y desde el cliente no
podemos distinguir "código mal escrito" de "policy bloqueante".

La función `SECURITY DEFINER` corre con permisos del owner, así que
saltea RLS. Devuelve sólo el `uuid`. La justificación completa está
en `supabase/policies.sql` con la definición.

Si la RPC devuelve `NULL`, el código no existe → mostramos error y
abortamos. Si devuelve un uuid, lo guardamos para el paso 3.

### Paso 2 · `supabase.auth.signUp(email, password)`

Esto crea una fila en `auth.users` (tabla nativa de Supabase, fuera
de nuestro schema). Si "Confirm email" estuviera activo, devolvería
sin sesión y habría que esperar la confirmación. **En el MVP está
desactivado** (ver DECISIONS.md), así que devuelve `session` activa
de inmediato.

A partir de ahora, el cliente Supabase ya tiene un JWT y `auth.uid()`
devuelve el id del nuevo user.

### Paso 3 · `INSERT INTO profiles`

```ts
await supabase.from('profiles').insert({
  id: user.id,
  nombre: data.nombre,
  rol: data.rol,
  campo_id: campoId,  // del paso 1, o NULL para jefe
});
```

La policy `profiles_insert` exige `id = auth.uid()`. Como el JWT del
paso 2 ya está activo, el INSERT pasa.

**Si este INSERT falla**, hacemos `signOut()` inmediatamente. El user
queda en `auth.users` (no podemos borrarlo desde el cliente) pero al
menos la app no piensa que está logueado en un estado inconsistente.

### Paso 4 · Cargar el profile en el store

Hacemos un `SELECT` del profile recién creado y lo metemos en el
Zustand store. La redirección al grupo correcto (`(jefe)` o
`(empleado)`) la dispara el layout raíz al detectar
`profile != null`.

### Triggers que se disparan en el camino

- `auth.users` inserta una fila → no tenemos triggers nuestros ahí
  (TODO: a futuro, un trigger que cree el profile automáticamente
  evitaría el problema del huérfano de raíz).
- `profiles` INSERT → no dispara triggers nuestros (los nuestros son
  todos `BEFORE UPDATE`).
- Si el user crea un campo más adelante: `campos_insert` valida que
  sea jefe (`current_user_rol() = 'jefe'`).

## Persistencia de sesión entre arranques

El cliente Supabase está configurado en `lib/supabase.ts` así:

```ts
auth: {
  storage: AsyncStorage,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
}
```

- **`storage: AsyncStorage`**: el JWT y el refresh token se guardan
  en AsyncStorage, que en mobile persiste entre cierres de la app.
  Sin esto, el user tendría que loguearse cada vez que abre la app.
- **`persistSession: true`**: explicita que queremos esa persistencia.
- **`autoRefreshToken: true`**: el JWT vive 1 hora. Antes de que
  expire, el cliente usa el refresh token (vida más larga, ~1 semana
  por default) para pedir un JWT nuevo, sin que el user haga nada.
  El cambio se notifica vía `onAuthStateChange`, que escuchamos en
  el store para resincronizar.
- **`detectSessionInUrl: false`**: en mobile no hay URL que parsear
  (eso es para flujos OAuth web).

En el primer arranque después de un login, la secuencia es:

1. La app monta `app/_layout.tsx`.
2. `expo-splash-screen` ya está mostrando el splash (lo
   "freezamos" con `preventAutoHideAsync()`).
3. `loadSession()` corre: lee de AsyncStorage, encuentra una sesión
   válida (o no), trae el profile.
4. Cuando termina, `loading` pasa a `false`. El efecto detecta el
   cambio, llama a `hideAsync()` (libera el splash) y dispara el
   `router.replace()` correcto.

Resultado: el user no ve la pantalla de login antes de que la app
detecte la sesión persistida. Sin este patrón, hay un flash de medio
segundo donde aparece login y desaparece.

## Cómo nos protege RLS desde la app

Ejemplo concreto: el jefe abre la pantalla de "Mis empleados" y la
app hace:

```ts
await supabase.from('profiles').select('*');
```

**Sin RLS**, esto devolvería todas las filas de `profiles` en la base
(de todos los campos, todos los jefes, todos los usuarios). La app
tendría que filtrar.

**Con RLS**, Postgres aplica la policy `profiles_select`:

```sql
USING (
    id = auth.uid()
    OR (campo_id IS NOT NULL AND campo_id = current_user_campo_id())
    OR campo_id IN (SELECT id FROM campos WHERE jefe_id = auth.uid())
)
```

Para el JWT del jefe, esto matchea:
- el profile del propio jefe (cláusula 1),
- profiles de empleados de cualquier campo donde es jefe (cláusula 3).

Si en la app hubiera un bug que hace `SELECT *` desde una pantalla
donde no debería ver tantos datos, **la base ya filtró**. La app
puede asumir que cualquier fila que recibe es legítima de mirar.

Esto también significa que **la app no puede preguntar "¿este user
puede ver X?"**. Si puede verlo, lo verá; si no, recibirá una lista
vacía o una negación. La autorización es resultado de la query, no
condición previa.

## ¿Por qué redirigimos por rol en el layout y no en cada pantalla?

`app/_layout.tsx` lee el profile del store y redirige:

- `rol = jefe` → `/(jefe)`
- `rol = empleado` → `/(empleado)`
- sin sesión o sin profile → `/(auth)/login`

Razones:

1. **DRY.** Si cada pantalla chequeara "¿soy del rol correcto?",
   habría que poner el chequeo en N lugares. Un día agregás
   pantalla nueva y te olvidás.
2. **El layout sabe primero.** El layout se monta antes que las
   pantallas hijas. Si el chequeo vive en una pantalla, el user
   ya entró y está viendo algo durante un instante.
3. **Una sola fuente de verdad.** El estado vive en el store; el
   layout reacciona. Cualquier cambio (signIn, signOut, refresh
   automático) recalcula la redirección sin que las pantallas
   sepan que existe esa lógica.
4. **No reemplaza a RLS.** Esto es UX, no seguridad. La autorización
   real la hace la base. Si un empleado abriera por algún motivo
   una pantalla del jefe, las queries devolverían vacío de todos
   modos.

## ¿Qué pasa si alguien intercepta el JWT?

El JWT viaja entre el cliente y Supabase. Tres líneas de defensa:

### HTTPS

Toda la comunicación con Supabase es por HTTPS. Un atacante en
medio de la red ve tráfico cifrado, no el token. (Si alguien
desactiva HTTPS, el JWT viaja claro y se puede robar.)

### Expiración corta

El JWT expira en **1 hora** por default. Si te lo roban, tienen una
ventana acotada. El refresh token, que dura más, está en AsyncStorage
del dispositivo: para robarlo hay que tener acceso físico o root
al teléfono.

### Refresh y revocación

Si pasa algo grave (cambio de contraseña, cierre de sesión desde
otro dispositivo), Supabase invalida el refresh token. El próximo
intento de refresh falla y la app deja al user deslogueado. Esto se
detecta vía `onAuthStateChange`, que escuchamos en el store.

### Lo que NO nos protege el JWT

Si un atacante tiene **acceso al device desbloqueado**, puede leer
AsyncStorage y robar el refresh token. La app no encripta ese
storage. En el contexto del MVP, no es problema; en producción se
podría usar `expo-secure-store` para el refresh token.

## Cómo testear el flujo

### Login

1. Levantar la app: `npm start` y abrir en device/emulador.
2. Caso feliz jefe:
   - Email: `jefe@test.com`, password: `test1234`.
   - Esperado: ver "Pantalla de jefe" con "Hola, [nombre]" y un
     botón "Salir" arriba a la derecha.
3. Caso feliz empleado:
   - Email: `empleado@test.com`, password: `test1234`.
   - Esperado: ver "Pantalla de empleado".
4. Password mal:
   - Email correcto, password `xxxxxx`.
   - Esperado: error "Email o contraseña incorrectos".
5. Email mal formado:
   - Email: `nopuede`, password: lo que sea.
   - Esperado: error de validación local "Email inválido", **sin**
     pegarle a Supabase.
6. Sin internet:
   - Apagar Wi-Fi y datos, intentar loguearse.
   - Esperado: error "Hubo un problema, intentá de nuevo".

### Persistencia

1. Loguearse como jefe.
2. Cerrar la app del todo (no minimizar, kill).
3. Abrirla de nuevo.
4. Esperado: arranca directo en "Pantalla de jefe", sin pasar por
   login. El splash debería estar visible hasta que la sesión esté
   confirmada.

### Logout

1. Estando logueado, tocar "Salir" arriba a la derecha.
2. Esperado: aparece un Alert "¿Cerrar sesión?".
3. Tocar "Cancelar" → no pasa nada.
4. Tocar "Salir" → vuelve a la pantalla de login.

### Registro como jefe

1. En login, tocar "Registrate".
2. Llenar:
   - Nombre: cualquiera ≥ 2 chars,
   - Email único (truco: `tu-mail+test1@gmail.com`),
   - Password ≥ 6, repetida.
3. Tocar "Soy jefe".
4. Tocar "Crear cuenta".
5. Esperado: redirige a "Pantalla de jefe".

### Registro como empleado

1. Mismo formulario.
2. Tocar "Soy empleado". Aparece el input "Código del campo".
3. Caso feliz: código `NORTE1` → redirige a "Pantalla de empleado".
4. Caso código mal: poner `NOEXISTE` → error "No existe un campo
   con ese código", **no** se crea user en auth (chequear en el
   dashboard de Supabase que no aparezca).
5. Caso passwords distintos: → error "Las contraseñas no coinciden".

### Validar errores de signup en estado intermedio

1. Crear user de prueba con un email único.
2. Logout.
3. Intentar volver a registrarse con el mismo email.
4. Esperado: error "Ese email ya está registrado".

## TODOs conocidos

Cosas que dejamos para v2 a propósito:

- **Pantalla "completar registro" para usuarios huérfanos.** Hoy si
  la app muere entre `auth.signUp()` y el `INSERT` de profiles, el
  user queda en `auth.users` sin profile. La app lo detecta en
  `loadSession()` y hace `signOut()` con un mensaje. Más prolijo
  sería una pantalla que reintente solo el INSERT con los datos que
  faltan. Decisión: el costo vs. beneficio para el MVP no daba.
- **Trigger en `auth.users` que cree un profile mínimo automáticamente.**
  Eliminaría el problema del huérfano de raíz. Lo dejamos
  documentado en `docs/01-schema-y-rls.md` también.
- **Reactivar email confirmation.** Cuando haya proveedor SMTP en
  producción. Va a cambiar el flujo de signUp (el INSERT del profile
  va a tener que vivir en otro lado, idealmente el trigger del punto
  anterior).
- **`expo-secure-store` para el refresh token.** Hoy AsyncStorage
  alcanza para el MVP, pero el refresh token tiene vida larga y
  cualquiera con acceso al device lo puede leer.
- **Recuperación de contraseña.** Necesita email configurado.
